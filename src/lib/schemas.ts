import { z } from 'zod';

export const ResourceSchema = z.object({
  type: z.enum(['Video', 'Course', 'Article', 'Documentation', 'Guide', 'Other']),
  title: z.string().min(1, 'Resource title must not be empty').transform(s => s.trim()),
  url: z.string().url().refine((val) => {
    const blocked = ['placeholder', 'INSERT_', 'your-link', 'example.com', 'LINK_HERE'];
    return !blocked.some((bad) => val.toLowerCase().includes(bad.toLowerCase()));
  }, { message: 'URL appears to be a placeholder' }),
  reason: z.string().min(1),
  year: z.number().int().nullable().optional(),
});

export type Resource = z.infer<typeof ResourceSchema>;

export const DayPlanSchema = z.object({
  day_number: z.number().int().min(1),
  topic: z.string().min(1),
  focus: z.string().min(1),
  resources: z.array(ResourceSchema).min(2)
    .refine((resources) => {
      const types = resources.map((r) => r.type);
      return types.includes('Video') && types.some((t) => t !== 'Video');
    }, { message: 'Must include at least one Video and one non-Video resource.' }),
  practice_task: z.string().min(1),
  learning_objectives: z.array(z.string()).min(2).max(5),
});

export type DayPlan = z.infer<typeof DayPlanSchema>;

export const LearningPathSchema = z.object({
  goal: z.string(),
  total_days: z.number().int().min(1).max(60),
  days: z.array(DayPlanSchema).min(1),
});

export type LearningPath = z.infer<typeof LearningPathSchema>;

export function resourceToMarkdown(r: Resource): string {
  const yearStr = r.year && r.type === 'Video' ? ` (Uploaded ${r.year})` : '';
  return `- [${r.title}](${r.url})${yearStr} — **Type:** ${r.type} — ${r.reason}`;
}

export function dayToMarkdown(day: DayPlan): string {
  const lines: string[] = [
    `## Day ${day.day_number} — ${day.topic}`,
    '',
    `**Focus:** ${day.focus}`,
    '',
    '### Resources',
  ];
  for (const r of day.resources) {
    lines.push(resourceToMarkdown(r));
  }
  lines.push(
    '',
    `**Practice / Reflection:** ${day.practice_task}`,
    '',
    '**Learning Objectives:**'
  );
  for (const obj of day.learning_objectives) {
    lines.push(`- ${obj}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function learningPathToMarkdown(
  lp: LearningPath,
  playlistUrl?: string | null,
  docUrl?: string | null,
  notionUrl?: string | null
): string {
  const sections: string[] = [
    `# Learning Path: ${lp.goal}`,
    '',
    `**Total Duration:** ${lp.total_days} day(s)`,
    '',
  ];

  // Auto-correct day numbering sequence
  const sortedDays = [...lp.days].sort((a, b) => a.day_number - b.day_number);
  for (let i = 0; i < sortedDays.length; i++) {
    sortedDays[i].day_number = i + 1;
    sections.push(dayToMarkdown(sortedDays[i]));
  }

  // Summary & Export links
  const summaryLines = ['---', '', '## Summary & Resources', ''];
  if (playlistUrl) {
    summaryLines.push(`- 🎧 **YouTube Playlist:** [${playlistUrl}](${playlistUrl})`);
  }
  if (docUrl) {
    summaryLines.push(`- 📄 **Google Doc:** [${docUrl}](${docUrl})`);
  }
  if (notionUrl) {
    summaryLines.push(`- 📝 **Notion Page:** [${notionUrl}](${notionUrl})`);
  }

  if (playlistUrl || docUrl || notionUrl) {
    sections.push(summaryLines.join('\n'));
  }

  return sections.join('\n');
}
