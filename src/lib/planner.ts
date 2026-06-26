import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { LearningPath, LearningPathSchema, DayPlan, DayPlanSchema } from './schemas';

// Build LLM instance matching original python configuration
function buildLlm(modelName: string = 'gemini-2.5-flash'): any {
  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is not configured in the environment.');
  }
  return new ChatGoogleGenerativeAI({
    model: modelName,
    apiKey: apiKey,
    temperature: 0.7,
  });
}

const SYSTEM_PREAMBLE = `You are a structured learning path generator.
You must return ONLY valid JSON — no markdown fences, no prose before or after.
The JSON must strictly match the schema below.

SCHEMA:
{
  "goal": "string — the user's goal restated concisely",
  "total_days": integer,
  "days": [
    {
      "day_number": integer,
      "topic": "string",
      "focus": "string — one sentence what the learner achieves today",
      "resources": [
        {
          "type": "Video | Course | Article | Documentation | Guide | Other",
          "title": "string",
          "url": "string — real, working URL (no placeholders)",
          "reason": "string — one sentence why it helps",
          "year": integer or null
        }
      ],
      "practice_task": "string",
      "learning_objectives": ["string", "string"]
    }
  ]
}

RULES:
- Every day must include at least ONE Video resource with a real youtube.com/watch?v= URL.
- Every day must include at least ONE non-Video resource.
- Never emit placeholder URLs (e.g. 'your-link-here', 'example.com').
- If you know a real working YouTube video ID, use: https://www.youtube.com/watch?v=VIDEO_ID
- If you DO NOT know a real working video ID for a topic, you MUST output a YouTube search URL instead: https://www.youtube.com/results?search_query=topic+name
- Prefer videos uploaded in the last 24 months. Include the upload year in the 'year' field.
- The 'total_days' field must match the exact number of objects in 'days'.
- Return ONLY the JSON object — nothing else.
`;

function buildGenerationPrompt(userGoal: string, desiredDays: number): string {
  return `${SYSTEM_PREAMBLE}\n\nUser Goal: ${userGoal}\nGenerate a learning path with exactly ${desiredDays} day(s).`;
}

function buildContinuationPrompt(userGoal: string, startDay: number, endDay: number): string {
  return `${SYSTEM_PREAMBLE}\n\nUser Goal: ${userGoal}\nContinue the learning path. Return ONLY days ${startDay} through ${endDay}. \nSet 'total_days' to ${endDay - startDay + 1}. \nDo NOT repeat earlier days. Return ONLY the JSON object.`;
}

function extractJson(text: string): string | null {
  let cleanText = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleanText.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < cleanText.length; i++) {
    const ch = cleanText[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return cleanText.substring(start, i + 1);
      }
    }
  }
  return null;
}

function inferDays(goalText: string, fallback: number = 10): number {
  const text = goalText.toLowerCase();
  const patterns = [
    { regex: /(\d+)\s*(?:day|days)/, mult: 1 },
    { regex: /(\d+)\s*(?:week|weeks)/, mult: 7 },
    { regex: /(\d+)\s*(?:month|months)/, mult: 30 },
  ];
  for (const p of patterns) {
    const m = text.match(p.regex);
    if (m) {
      const days = parseInt(m[1], 10) * p.mult;
      return Math.max(1, Math.min(60, days));
    }
  }
  return Math.max(1, Math.min(60, fallback));
}

async function parseLearningPath(
  rawText: string,
  goal: string,
  expectedDays: number
): Promise<LearningPath | null> {
  const jsonStr = extractJson(rawText);
  if (!jsonStr) return null;

  let data: any;
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }

  // Inject defaults
  if (!data.goal) data.goal = goal;
  if (!data.total_days) data.total_days = data.days?.length || expectedDays;

  // Validate complete path
  const parsed = LearningPathSchema.safeParse(data);
  if (parsed.success) {
    return parsed.data;
  }

  // Salvage logic: try to recover valid days and compile them
  const rawDays = data.days || [];
  const validDays: DayPlan[] = [];
  for (const d of rawDays) {
    const dayParsed = DayPlanSchema.safeParse(d);
    if (dayParsed.success) {
      validDays.push(dayParsed.data);
    }
  }

  if (validDays.length === 0) {
    return null;
  }

  data.days = validDays;
  data.total_days = validDays.length;

  const finalParsed = LearningPathSchema.safeParse(data);
  return finalParsed.success ? finalParsed.data : null;
}

export async function generate(
  userGoal: string,
  modelName: string = 'gemini-2.5-flash',
  progressCallback?: (msg: string) => void
): Promise<LearningPath> {
  const progress = (msg: string) => {
    if (progressCallback) progressCallback(msg);
  };

  const llm = buildLlm(modelName);
  const fallbackDays = parseInt(process.env.DESIRED_DAYS || '10', 10);
  const desiredDays = inferDays(userGoal, fallbackDays);

  progress(`Planning ${desiredDays}-day learning path with ${modelName}…`);

  // --- Initial Generation ---
  const prompt = buildGenerationPrompt(userGoal, desiredDays);
  const response = await llm.invoke(prompt);
  const rawText = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  
  const firstLp = await parseLearningPath(rawText, userGoal, desiredDays);
  if (!firstLp) {
    throw new Error(
      `LLM returned output that could not be parsed as a valid LearningPath. Raw response: ${rawText.substring(0, 500)}`
    );
  }

  progress(`Received ${firstLp.days.length} day(s)…`);

  // --- Iterative Continuation Loops ---
  const maxContinuationIterations = parseInt(process.env.CONTINUATION_MAX_ITER || '4', 10);
  const allDays = [...firstLp.days];
  let iteration = 0;

  while (allDays.length < desiredDays && iteration < maxContinuationIterations) {
    iteration++;
    const startDay = allDays.length + 1;
    const endDay = desiredDays;
    progress(`Requesting continuation: Day ${startDay}–${endDay} (attempt ${iteration})…`);

    const contPrompt = buildContinuationPrompt(userGoal, startDay, endDay);
    const contResp = await llm.invoke(contPrompt);
    const contText = typeof contResp.content === 'string' ? contResp.content : JSON.stringify(contResp.content);
    
    const contLp = await parseLearningPath(contText, userGoal, endDay - startDay + 1);
    if (!contLp || !contLp.days || contLp.days.length === 0) {
      progress('Continuation returned no parseable days — stopping.');
      break;
    }

    // Shift day numbers so they append sequentially
    for (let i = 0; i < contLp.days.length; i++) {
      contLp.days[i].day_number = startDay + i;
    }
    allDays.push(...contLp.days);
    progress(`Total days so far: ${allDays.length}`);
  }

  const finalLp: LearningPath = {
    goal: firstLp.goal,
    total_days: allDays.length,
    days: allDays,
  };

  progress('Learning path generation complete! ✅');
  return finalLp;
}
