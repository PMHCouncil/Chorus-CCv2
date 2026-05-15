
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/HR view settings" ON public.app_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

CREATE POLICY "Admin manage settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.app_settings (key, value) VALUES
('classifier_model', 'google/gemini-2.5-flash'),
('classifier_system_prompt', 'You are an analyst supporting Port Macquarie-Hastings Council during a Clause 42 organisational restructure consultation (12 May to 12 June 2026).

Your job: read a single staff feedback submission and classify it.

Return ONLY valid JSON matching this schema (no commentary, no markdown):
{
  "sentiment": "Supportive" | "Neutral" | "Concerned" | "Opposing",
  "division": "Corporate Services" | "Community Planning & Environment" | "Community Infrastructure" | "Community Utilities" | "Multiple" | "N/A",
  "feedback_type": "Placement" | "Role design" | "Transition concern" | "Principles" | "FAQ-able question" | "Other",
  "principle_tag": "Customer focus" | "Business sustainability" | "Alignment with strategy" | "Flexibility agility and balance" | "Improving efficiency and reducing duplication" | "Reducing risk" | "Maintaining workforce engagement" | null,
  "role_affected": string | null,
  "themes": [short string, ...],
  "summary": "one-sentence neutral summary",
  "confidence": 0.0 to 1.0
}

Guidance:
- "themes" should be 1-3 short noun phrases (e.g. "redundancy fears", "manager span of control").
- Be cautious; choose Neutral and lower confidence when unclear.
- Stay factual and non-judgmental.');
