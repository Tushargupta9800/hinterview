import {
  promptScaffoldBundleSchema,
  stagePlaygroundAnswerSchema,
  type AgentProfile,
  type AiPromptAction,
  type InterviewSession,
  type PromptScaffold,
  type PromptScaffoldBundle,
  type QuestionDetail,
  type StageProgress
} from "@hinterview/shared";

const actionInstruction: Record<AiPromptAction, string> = {
  hint:
    "Give only the next nudge based on the user's current draft. Point out what is missing or weak in brief. Do not reveal the full answer.",
  answer: "Provide the interview-ready reference answer, scoped tightly to this stage only.",
  evaluation:
    "Score for interview readiness out of 10. Ignore grammar noise, reward broad correct coverage, and stay inside the stated scope."
};

const buildCompactPayload = (
  question: QuestionDetail,
  session: InterviewSession,
  stage: StageProgress
): string => {
  const parseDraft = (value: string) => {
    try {
      return stagePlaygroundAnswerSchema.parse(JSON.parse(value));
    } catch {
      return value;
    }
  };

  // LLM APIs consume text, so a compact text payload is cheaper than wrapping binary protobuf data in base64.
  return JSON.stringify({
    q: question.title,
    qs: question.scope,
    m: session.mode,
    ps: session.stages
      .filter((item) => item.orderIndex < stage.orderIndex)
      .map((item) => ({
        i: item.orderIndex,
        t: item.title,
        s: item.status,
        da: parseDraft(item.draftAnswer),
        ra: item.referenceAnswer,
        fs: item.lastFeedbackSummary
      })),
    st: {
      i: stage.orderIndex,
      t: stage.title,
      p: stage.prompt,
      g: stage.guidance,
      k: stage.expectedKeywords,
      mw: stage.minimumWords,
      rf: stage.isCoreFocus ? 1 : 0
    },
    a: parseDraft(stage.draftAnswer),
    tr: {
      u: stage.triesUsed,
      l: stage.remainingTries,
      mx: stage.maxTries
    }
  });
};

const buildSystemPrompt = (agent: AgentProfile, action: AiPromptAction): string =>
  [
    "You are an interview-focused system design evaluator.",
    actionInstruction[action],
    "Write in simple English. Use technical terms when needed, but avoid fancy or high-level wording.",
    "Do not use words like 'imprecise', 'nuanced', 'robust', or similar inflated language unless the stage itself requires them.",
    "Never drift into adjacent systems that are explicitly out of scope.",
    agent.systemPrompt.trim()
  ]
    .filter(Boolean)
    .join("\n\n");

const buildUserPrompt = (
  question: QuestionDetail,
  session: InterviewSession,
  stage: StageProgress,
  action: AiPromptAction
): string => {
  const compactPayload = buildCompactPayload(question, session, stage);
  const responseShape =
    action === "evaluation"
      ? {
          score: "number 0-10 with up to 2 decimal places",
          strengths: ["short bullet", "short bullet"],
          weaknesses: ["short bullet", "short bullet"],
          matchedKeywords: ["keyword"],
          missingKeywords: ["keyword"],
          feedbackSummary: "1-3 sentence summary",
          isSolved: "boolean where true means score >= 8.00"
        }
      : action === "hint"
        ? {
            hint: "one scoped hint without revealing the full answer"
          }
        : {
            answer: "the full scoped interview answer for this stage"
          };

  return [
    `Task: ${action}`,
    `Current stage title: ${stage.title}`,
    "Answer only the current stage. Do not mix content from any other stage.",
    "Judge only on the basis of the current stage prompt, current stage guidance, and current stage expected keywords.",
    "This is a timed mock interview. The user does not need to write a long detailed answer if the main points are correct.",
    "Reward concise answers that cover most of the expected focus points in broad terms.",
    "Do not expect production-depth detail unless the current stage explicitly asks for it.",
    "Previous stages are context only. Use them only to understand what is already covered. Do not ask the user to repeat earlier content if it was already discussed.",
    "Previous stages must not expand the scope of the current stage. If the current stage does not ask for something, do not require it.",
    "Use the current draft answer from the payload when you judge what is missing, weak, or incorrect.",
    "The draft answer may be plain text or a structured playground JSON object. If it is structured JSON, use its plainText field and diagram items together.",
    "When the answer comes from playground JSON, read text, shapes, and arrows as one combined answer instead of demanding only prose.",
    "Do not treat paraphrased or equivalent wording as missing. If the user expresses the same idea in simpler words, count it as covered.",
    "Do not mark it as a weakness just because the user did not repeat the out-of-scope lines already stated in the problem.",
    "If the problem statement already says some systems are out of scope, the user does not need to restate that unless the stage explicitly asks for scope clarification.",
    "Do not ask for a more explicit rewrite when the user's sentence already captures the same create, resolve, redirect, or return flow in plain language.",
    "Never include a weakness that says the user should restate excluded systems such as auth, analytics, dashboards, or abuse tooling when the problem already marks them out of scope.",
    "Never include a weakness only because the user did not repeat scope boundaries already written in the problem statement.",
    "If the user adds one small extra point that is still related to the core flow, do not treat that by itself as a weakness.",
    "Do not reduce the score just because the user added extra points beyond the asked scope.",
    "If an extra point is unnecessary, you may mention it briefly in weaknesses, but score the answer only on whether the asked points are covered correctly.",
    "Only call something extra or out of scope if it materially distracts from the current answer. Small related additions should be ignored, not penalized.",
    "Do not include a weakness that says a related item is 'not a main requirement' unless that item is clearly unrelated or replaces a missing core requirement.",
    "If the stage is about functional requirements, do not include non-functional requirements, tradeoffs, scaling, storage internals, or out-of-scope platform concerns.",
    "If the stage is about non-functional requirements, do not restate functional requirements, service responsibilities, APIs, storage design, or QPS math unless the stage explicitly asks for them.",
    "For non-functional requirements stages, evaluate only the quality of the non-functional requirements list, prioritization, and explanation. Do not penalize for missing calculations or component design that the prompt did not ask for.",
    "Judge only on the stage focus points and expected keywords. Do not score against real-world extras that are not asked for.",
    "Do not penalize for missing observability, alerting, auditing, analytics, dashboards, or other good-to-have concerns unless the current stage explicitly asks for them.",
    "If the user's answer covers the right ideas with simple wording or short bullets, treat that as valid coverage.",
    "When in doubt, be slightly lenient if the core interview points are present.",
    "Do not add extra sections such as out-of-scope, assumptions, APIs, entities, or tradeoffs unless the current stage explicitly asks for them.",
    "Keep the answer directly usable by a candidate in an interview for this exact stage prompt.",
    action === "hint"
      ? "For hints: keep it short, simple, and actionable. Mention only the next 1-3 things to improve. Do not give the full solution."
      : action === "evaluation"
        ? "For evaluations: score only against the current stage. If the user already covered some relevant point in an earlier stage, do not mark it missing here unless the current stage explicitly asks them to restate it. Prefer broad correctness over depth. Return a score with up to 2 decimal places."
        : "For answers: stay direct and concrete.",
    "Use the compact interview payload below.",
    "Return only valid JSON that matches this shape.",
    JSON.stringify(responseShape),
    compactPayload
  ].join("\n\n");
};

export const buildPromptScaffolds = (
  question: QuestionDetail,
  session: InterviewSession,
  stage: StageProgress,
  agent: AgentProfile
): PromptScaffoldBundle => {
  const items: PromptScaffold[] = (["hint", "answer", "evaluation"] as const).map((action) => ({
    action,
    provider: agent.provider,
    model: agent.model,
    systemPrompt: buildSystemPrompt(agent, action),
    userPrompt: buildUserPrompt(question, session, stage, action),
    compactPayload: buildCompactPayload(question, session, stage)
  }));

  return promptScaffoldBundleSchema.parse({
    sessionId: session.id,
    stageId: stage.stageId,
    items
  });
};
