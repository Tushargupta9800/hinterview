import type { InterviewMode, QuestionDetail, QuestionStage } from "./contracts.js";

type StageConfig = Omit<QuestionStage, "id" | "mode" | "orderIndex" | "maxTries"> & {
  idSuffix: string;
};

const buildStages = (mode: InterviewMode, configs: StageConfig[]): QuestionStage[] =>
  configs.map((config, index) => ({
    id: `${mode}-${config.idSuffix}`,
    mode,
    orderIndex: index,
    title: config.title,
    prompt: config.prompt,
    guidance: config.guidance,
    referenceAnswer: config.referenceAnswer,
    expectedKeywords: config.expectedKeywords,
    minimumWords: config.minimumWords,
    isCoreFocus: config.isCoreFocus,
    maxTries: 3
  }));

const buildCommonStages = (problemKey: string, context: {
  functional: string;
  nonFunctional: string;
  entities: string;
  api: string;
}): Record<InterviewMode, StageConfig[]> => ({
  hld: [
    {
      idSuffix: `${problemKey}-functional-requirements`,
      title: "Functional requirements",
      prompt: context.functional,
      guidance: "List the core user-visible capabilities first. Stay scoped to the stated problem only.",
      referenceAnswer:
        "Start with the smallest correct set of user-facing capabilities. Keep the answer bounded to the problem statement, call out what is in scope, and explicitly mention related areas that are assumed to already exist.",
      expectedKeywords: ["scope", "user", "send", "receive", "in scope"],
      minimumWords: 24,
      isCoreFocus: false
    },
    {
      idSuffix: `${problemKey}-non-functional-requirements`,
      title: "Non-functional requirements",
      prompt: context.nonFunctional,
      guidance: "Cover scale, latency, reliability, consistency, and availability based on the problem.",
      referenceAnswer:
        "Call out the non-functional requirements that shape the design: expected scale, latency sensitivity, durability, availability, and consistency. Explain which ones matter most for this problem and why.",
      expectedKeywords: ["scale", "latency", "availability", "consistency", "reliability"],
      minimumWords: 24,
      isCoreFocus: false
    },
    {
      idSuffix: `${problemKey}-core-entities`,
      title: "Core entities",
      prompt: context.entities,
      guidance: "Define only the entities that matter to the design. Avoid unrelated product areas.",
      referenceAnswer:
        "Identify the smallest useful entity set that explains the system: core business objects, their ownership, their key relationships, and the state each one must carry to support the design.",
      expectedKeywords: ["entity", "state", "relation", "id", "metadata"],
      minimumWords: 20,
      isCoreFocus: false
    },
    {
      idSuffix: `${problemKey}-api-routes`,
      title: "API routes",
      prompt: context.api,
      guidance: "Shorthand routes are fine. Focus on the key calls and payload intent rather than exhaustiveness.",
      referenceAnswer:
        "Define the key APIs that move the system forward. Interview shorthand like POST or GET routes is fine as long as the intent, ownership, and main request-response contract are clear.",
      expectedKeywords: ["post", "get", "request", "response", "route"],
      minimumWords: 18,
      isCoreFocus: false
    }
  ],
  lld: [
    {
      idSuffix: `${problemKey}-functional-requirements`,
      title: "Functional requirements",
      prompt: context.functional,
      guidance: "List the core user-visible capabilities first. Stay scoped to the stated problem only.",
      referenceAnswer:
        "Start with the smallest correct set of user-facing capabilities. Keep the answer bounded to the problem statement, call out what is in scope, and explicitly mention related areas that are assumed to already exist.",
      expectedKeywords: ["scope", "user", "send", "receive", "in scope"],
      minimumWords: 24,
      isCoreFocus: false
    },
    {
      idSuffix: `${problemKey}-non-functional-requirements`,
      title: "Non-functional requirements",
      prompt: context.nonFunctional,
      guidance: "Cover scale, latency, reliability, consistency, and availability based on the problem.",
      referenceAnswer:
        "Call out the non-functional requirements that shape the design: expected scale, latency sensitivity, durability, availability, and consistency. Explain which ones matter most for this problem and why.",
      expectedKeywords: ["scale", "latency", "availability", "consistency", "reliability"],
      minimumWords: 24,
      isCoreFocus: false
    },
    {
      idSuffix: `${problemKey}-core-entities`,
      title: "Core entities",
      prompt: context.entities,
      guidance: "Define only the entities that matter to the design. Avoid unrelated product areas.",
      referenceAnswer:
        "Identify the smallest useful entity set that explains the system: core business objects, their ownership, their key relationships, and the state each one must carry to support the design.",
      expectedKeywords: ["entity", "state", "relation", "id", "metadata"],
      minimumWords: 20,
      isCoreFocus: false
    },
    {
      idSuffix: `${problemKey}-api-routes`,
      title: "API routes",
      prompt: context.api,
      guidance: "Shorthand routes are fine. Focus on the key calls and payload intent rather than exhaustiveness.",
      referenceAnswer:
        "Define the key APIs that move the system forward. Interview shorthand like POST or GET routes is fine as long as the intent, ownership, and main request-response contract are clear.",
      expectedKeywords: ["post", "get", "request", "response", "route"],
      minimumWords: 18,
      isCoreFocus: false
    }
  ]
});

const chatCommon = buildCommonStages("chat", {
  functional:
    "For a 1:1 chat message delivery system, what functional requirements are in scope if authentication, contacts, and user profile management already exist?",
  nonFunctional:
    "For the same 1:1 chat message delivery system, what non-functional requirements should drive the design discussion?",
  entities:
    "What are the core entities you need for accepting, storing, and delivering a 1:1 chat message?",
  api:
    "What are the main API routes or messaging endpoints you would expose for sending a 1:1 message, acknowledging delivery, and fetching recent conversation history?"
});

const orderCommon = buildCommonStages("order", {
  functional:
    "For an order reservation system under peak traffic, what functional requirements are in scope if authentication, catalog, and payments already exist?",
  nonFunctional:
    "What non-functional requirements matter most for order reservation correctness during flash-sale traffic?",
  entities:
    "What are the core entities required for order placement, reservation, inventory state, and reservation expiry?",
  api:
    "What are the important API routes for placing an order, reserving stock, confirming it, and releasing an expired reservation?"
});

const rateLimiterCommon = buildCommonStages("rate", {
  functional:
    "For a distributed rate limiter, what functional requirements are in scope if authentication and upstream routing already exist?",
  nonFunctional:
    "What non-functional requirements matter most for fast and fair rate-limit enforcement across many servers?",
  entities:
    "What are the core entities or state records needed to represent rate-limit policies and counters?",
  api:
    "What are the key interfaces for checking limits, consuming capacity, and managing rate-limit policy definitions?"
});

const urlShortenerCommon = buildCommonStages("url", {
  functional:
    "For a URL shortener, what functional requirements are in scope if authentication, analytics dashboards, and abuse tooling already exist?",
  nonFunctional:
    "What non-functional requirements matter most for a URL shortener that mainly needs fast redirects and reliable short-link creation?",
  entities:
    "What are the core entities needed for creating and resolving short URLs?",
  api:
    "What are the main API routes for creating a short URL and resolving or expanding it?"
});

export const seededQuestions: QuestionDetail[] = [
  {
    id: "q_chat_delivery",
    slug: "chat-delivery-system",
    title: "Design Chat Message Delivery",
    summary: "Focus on the core 1:1 message delivery path without drifting into multi-device sync, offline recovery, or notifications.",
    difficulty: "intermediate",
    focusArea: "delivery",
    tags: ["chat", "realtime", "fan-out"],
    supportedModes: ["hld", "lld"],
    scope: "Assume authentication, contacts, and profile management already exist. Focus only on the core 1:1 online message delivery path: accept a message, store it durably, and deliver it to the recipient.",
    detailedDescription:
      "Design the core message-delivery path of a 1:1 chat system. The interviewer wants to see how a message is accepted from a sender, persisted durably, and delivered quickly to the intended recipient. Keep the discussion centered on the main online delivery flow and the tradeoff between low latency and reliable delivery.",
    assumptions: [
      "Authentication and user identity already exist.",
      "Contacts and the social graph already exist.",
      "User profile management already exists.",
      "This discussion is only about the main 1:1 message delivery path and its correctness."
    ],
    qpsAssumptions: [
      "Assume roughly 8 to 12 thousand message-send requests per second at peak.",
      "Assume online delivery fan-out is still 1:1 for this problem, so the main scaling concern is sustained write and delivery throughput, not broad broadcast.",
      "Assume recent conversation fetch is common but still secondary to the hot send-and-deliver path."
    ],
    inScope: [
      "Sending a 1:1 message from one user to another.",
      "Durable persistence before successful acknowledgement.",
      "Online recipient delivery path.",
      "Per-conversation ordering for direct chat.",
      "Basic delivery acknowledgement."
    ],
    outOfScope: [
      "Authentication and authorization design.",
      "Contact discovery and address book logic.",
      "User profile management.",
      "Offline synchronization, reconnect catch-up, and multi-device fan-out.",
      "Notifications, media processing, moderation, and analytics unless explicitly added later."
    ],
    focusPoints: [
      "Fast write acceptance with durable storage.",
      "Clear online delivery path from sender to recipient.",
      "Per-conversation ordering instead of global ordering.",
      "Reliable acknowledgement after durable acceptance.",
      "Simple failure handling for the core delivery path."
    ],
    stages: [
      ...buildStages("hld", [
        ...chatCommon.hld,
        {
          idSuffix: "chat-high-level-design",
          title: "High level design",
          prompt: "What is your high-level architecture for accepting, storing, and delivering a 1:1 chat message to an online recipient?",
          guidance: "Explain the main components and why each one exists. Keep the flow interview-ready, not production-exhaustive.",
          referenceAnswer:
            "A clean interview-ready HLD has a message ingress layer, durable message store, delivery pipeline, and a recipient connection or delivery path. The design should show how messages enter, persist, and get delivered in order to the target user.",
          expectedKeywords: ["ingress", "store", "delivery", "recipient", "ordering"],
          minimumWords: 32,
          isCoreFocus: true
        },
        {
          idSuffix: "chat-ordering-and-reliability",
          title: "Ordering and reliability",
          prompt: "How will the system preserve practical per-conversation ordering and avoid losing messages on the core delivery path?",
          guidance: "Focus on durable acceptance, per-conversation sequencing, acknowledgement timing, and simple retry behavior.",
          referenceAnswer:
            "Persist the message durably before success is confirmed, assign ordering at the conversation level, and use a simple delivery worker or retry path for transient failures. That gives practical ordering and reliable delivery without needing global sequencing.",
          expectedKeywords: ["durable", "sequence", "conversation", "acknowledgement", "retry"],
          minimumWords: 30,
          isCoreFocus: true
        }
      ]),
      ...buildStages("lld", [
        ...chatCommon.lld,
        {
          idSuffix: "chat-low-level-components",
          title: "Low level design",
          prompt: "What classes, modules, or services would you define for message ingestion, persistence, ordering, and online delivery?",
          guidance: "Focus on responsibilities and clear boundaries instead of implementation trivia.",
          referenceAnswer:
            "A good LLD breaks the system into clear modules such as message service, message repository, ordering or sequencing helper, delivery worker, and acknowledgement handler. Each one owns one responsibility and collaborates through narrow interfaces.",
          expectedKeywords: ["service", "repository", "worker", "ordering", "interface"],
          minimumWords: 28,
          isCoreFocus: true
        },
        {
          idSuffix: "chat-concurrency-control",
          title: "Concurrency and delivery correctness",
          prompt: "How will your low-level design avoid duplicate delivery and preserve per-conversation order when retries or concurrent processing happen?",
          guidance: "Discuss idempotency, sequence assignment, state transitions, compare-and-set, or leases.",
          referenceAnswer:
            "Use idempotency keys or unique message identifiers, persist delivery state transitions atomically, and assign sequence numbers per conversation. Workers should rely on compare-and-set or lease semantics so retries stay safe and ordered.",
          expectedKeywords: ["idempotency", "sequence", "state", "compare-and-set", "duplicate"],
          minimumWords: 28,
          isCoreFocus: true
        }
      ])
    ]
  },
  {
    id: "q_order_peak",
    slug: "order-processing-system",
    title: "Design Order Processing Under Peak Traffic",
    summary: "Focus on inventory reservation correctness under flash-sale traffic instead of the whole order lifecycle.",
    difficulty: "advanced",
    focusArea: "concurrency",
    tags: ["orders", "inventory", "peak-traffic"],
    supportedModes: ["hld", "lld"],
    scope: "Assume user authentication, payments, and catalog management already exist. Focus only on inventory reservation correctness under heavy traffic.",
    detailedDescription:
      "Design the reservation path for an order system under flash-sale traffic. The main concern is preserving reservation correctness while surviving extreme bursts. Keep the discussion centered on safe reservation, expiry, and oversell prevention.",
    assumptions: [
      "Authentication already exists.",
      "Catalog management already exists.",
      "Payment authorization and capture already exist.",
      "The design should focus only on reservation correctness under peak demand."
    ],
    qpsAssumptions: [
      "Assume a flash-sale spike of about 50 to 100 thousand order attempts per second at peak.",
      "Assume a small subset of hot SKUs receives most of the traffic, so hotspot handling matters more than even traffic distribution.",
      "Assume reservation timeout and release traffic is much lower than peak write traffic, but still important for correctness."
    ],
    inScope: [
      "Inventory reservation before final confirmation.",
      "Reservation expiry and release.",
      "Oversell prevention.",
      "Queueing, admission control, and partitioned reservation processing."
    ],
    outOfScope: [
      "User authentication flows.",
      "Catalog browsing and product search.",
      "Payment gateway internals.",
      "Warehouse management details beyond inventory correctness boundaries."
    ],
    focusPoints: [
      "Admission control during traffic spikes.",
      "Strong reservation correctness.",
      "Per-SKU or partitioned concurrency control.",
      "Timeout handling and release flows.",
      "Short reservation write path with resilient asynchronous follow-up."
    ],
    stages: [
      ...buildStages("hld", [
        ...orderCommon.hld,
        {
          idSuffix: "order-high-level-design",
          title: "High level design",
          prompt: "What is your high-level architecture for inventory reservation, timeout handling, and oversell prevention under flash-sale traffic?",
          guidance: "Explain the main services and the write path clearly.",
          referenceAnswer:
            "A clean HLD uses an order ingress path, reservation service, inventory store with strong local correctness, expiry handling, and confirmation flow. The write path should be short, resilient, and queue-backed where peak traffic would otherwise overload synchronous dependencies.",
          expectedKeywords: ["reservation", "inventory", "queue", "expiry", "confirmation"],
          minimumWords: 32,
          isCoreFocus: true
        },
        {
          idSuffix: "order-peak-traffic",
          title: "Peak traffic and oversell prevention",
          prompt: "How will your design survive flash-sale spikes and stop overselling while still scaling horizontally?",
          guidance: "Focus on admission control, queues, reservation, partitioning, and correctness.",
          referenceAnswer:
            "Use admission control and queue-backed order intake to absorb bursts, reserve stock before final confirmation, and partition inventory updates by SKU or warehouse. Correctness stays around the reservation boundary while throughput scales through partitioned processing.",
          expectedKeywords: ["admission", "queue", "reservation", "partition", "sku"],
          minimumWords: 30,
          isCoreFocus: true
        }
      ]),
      ...buildStages("lld", [
        ...orderCommon.lld,
        {
          idSuffix: "order-low-level-design",
          title: "Low level design",
          prompt: "What modules or classes would you define for reservation, timeout release, and reservation state transitions?",
          guidance: "Focus on lifecycle responsibilities and boundaries.",
          referenceAnswer:
            "Model components such as ReservationService, ReservationRepository, ExpiryScheduler, OrderConfirmationService, and OrderStateCoordinator. Each should own a precise part of the reservation lifecycle and expose narrow interfaces.",
          expectedKeywords: ["service", "repository", "scheduler", "state", "confirmation"],
          minimumWords: 28,
          isCoreFocus: true
        },
        {
          idSuffix: "order-concurrency-control",
          title: "Concurrency and inventory correctness",
          prompt: "How will your low-level design handle multiple users racing for the last item without overselling?",
          guidance: "Discuss atomic updates, transactions, compare-and-set, or per-SKU serialization.",
          referenceAnswer:
            "Keep the stock transition from available to reserved atomic with compare-and-set, row-level transaction semantics, or serialized per-SKU processing. The design must guarantee that only one reservation succeeds for the last unit.",
          expectedKeywords: ["atomic", "transaction", "compare-and-set", "serialized", "sku"],
          minimumWords: 28,
          isCoreFocus: true
        }
      ])
    ]
  },
  {
    id: "q_url_shortener",
    slug: "url-shortener",
    title: "Design a URL Shortener",
    summary: "Focus on the core create-and-redirect flow instead of analytics, abuse systems, or product extras.",
    difficulty: "beginner",
    focusArea: "storage",
    tags: ["url-shortener", "redirects", "beginner"],
    supportedModes: ["hld", "lld"],
    scope: "Assume authentication, analytics, and abuse tooling already exist. Focus only on creating a short URL and resolving it quickly to the original long URL.",
    detailedDescription:
      "Design the core of a URL shortener. The interviewer wants to see how a long URL is converted into a short code, stored durably, and then resolved quickly during redirects. Keep the discussion centered on the main create and redirect flow.",
    assumptions: [
      "Authentication and user accounts already exist.",
      "Analytics and click reporting already exist.",
      "Abuse detection and moderation already exist.",
      "The design should focus only on short-link creation and redirect lookup."
    ],
    qpsAssumptions: [
      "Assume short-link creation is modest, around a few hundred to one thousand writes per second at peak.",
      "Assume redirect traffic is much higher, around 20 to 50 thousand lookups per second at peak.",
      "Assume read traffic is heavily skewed, so caching and read-path optimization matter more than write scaling."
    ],
    inScope: [
      "Create a short URL from a long URL.",
      "Store the mapping from short code to long URL.",
      "Redirect quickly from the short URL to the original URL.",
      "Handle repeated short-link creation in a reasonable way."
    ],
    outOfScope: [
      "User authentication and account management.",
      "Analytics dashboards and click reporting internals.",
      "Abuse detection, spam prevention, and moderation.",
      "QR codes, campaigns, expiration policies, and custom domains unless explicitly added later."
    ],
    focusPoints: [
      "Simple create-short-link API and flow.",
      "Fast redirect lookup path.",
      "Unique short-code generation.",
      "Durable storage of URL mappings.",
      "Basic scaling for heavy read traffic."
    ],
    stages: [
      ...buildStages("hld", [
        ...urlShortenerCommon.hld,
        {
          idSuffix: "url-high-level-design",
          title: "High level design",
          prompt: "What is your high-level architecture for creating a short URL and redirecting users quickly to the original long URL?",
          guidance: "Explain the main components and keep the flow simple and interview-ready.",
          referenceAnswer:
            "A clean HLD has an API layer for short-link creation, a short-code generator, a durable mapping store, and a fast redirect lookup path. The design should show how links are created once and then read many times with low latency.",
          expectedKeywords: ["api", "generator", "mapping", "store", "redirect"],
          minimumWords: 28,
          isCoreFocus: true
        },
        {
          idSuffix: "url-scaling-and-storage",
          title: "Storage and scaling",
          prompt: "How will your design generate unique short codes and handle much heavier redirect traffic than write traffic?",
          guidance: "Focus on code generation, storage choice, caching, and read-heavy scaling.",
          referenceAnswer:
            "Generate unique short codes with a counter, random-id approach, or pre-generated pool, then store the mapping durably. Because redirects are read-heavy, use caching or replicated read paths so lookups stay fast while writes remain simple.",
          expectedKeywords: ["unique", "code", "cache", "read", "replica"],
          minimumWords: 28,
          isCoreFocus: true
        }
      ]),
      ...buildStages("lld", [
        ...urlShortenerCommon.lld,
        {
          idSuffix: "url-low-level-design",
          title: "Low level design",
          prompt: "What classes, modules, or services would you define for short-code generation, mapping storage, and redirect resolution?",
          guidance: "Focus on responsibilities and interfaces, not framework details.",
          referenceAnswer:
            "A good LLD separates responsibilities into modules such as ShortLinkService, CodeGenerator, UrlMappingRepository, and RedirectResolver. Each module should do one job clearly and collaborate through narrow interfaces.",
          expectedKeywords: ["service", "generator", "repository", "resolver", "interface"],
          minimumWords: 24,
          isCoreFocus: true
        },
        {
          idSuffix: "url-collision-and-correctness",
          title: "Collision handling and correctness",
          prompt: "How will your low-level design avoid short-code collisions and make sure redirects always resolve to the correct long URL?",
          guidance: "Discuss uniqueness checks, retries, atomic writes, or constraints.",
          referenceAnswer:
            "Use a uniqueness constraint on the short code, generate a new code on collision, and persist the mapping atomically before it becomes visible for redirects. That keeps creation safe and redirect resolution correct.",
          expectedKeywords: ["unique", "collision", "retry", "atomic", "constraint"],
          minimumWords: 24,
          isCoreFocus: true
        }
      ])
    ]
  },
  {
    id: "q_rate_limiter",
    slug: "distributed-rate-limiter",
    title: "Design a Distributed Rate Limiter",
    summary: "Focus on fast distributed limit enforcement instead of every possible gateway concern.",
    difficulty: "intermediate",
    focusArea: "scaling",
    tags: ["rate-limiter", "distributed-systems", "fairness"],
    supportedModes: ["hld"],
    scope: "Assume authentication is already done. Focus only on fast distributed limit enforcement and the state needed to support it.",
    detailedDescription:
      "Design a distributed rate limiter that can evaluate requests quickly across many servers. The interviewer wants to understand where enforcement sits, how counters are updated, what algorithm you choose, and what consistency tradeoffs are acceptable for practical fairness.",
    assumptions: [
      "Caller identity is already known when requests reach the limiter.",
      "The limiter sits on the request path or very close to it.",
      "The design should optimize for fast enforcement with practical fairness."
    ],
    qpsAssumptions: [
      "Assume the limiter evaluates around 100 to 300 thousand requests per second across the fleet at peak.",
      "Assume latency budget for the limiter itself is very small, usually single-digit milliseconds on the hot path.",
      "Assume policy updates are rare compared to request evaluation traffic."
    ],
    inScope: [
      "Policy definition and lookup.",
      "Request evaluation and enforcement.",
      "Counter/token state management.",
      "Algorithm choice and tradeoffs.",
      "Sharding and consistency behavior under distributed traffic."
    ],
    outOfScope: [
      "Authentication and identity resolution.",
      "Unrelated upstream routing design.",
      "Billing and quota product design.",
      "General API gateway concerns outside rate enforcement."
    ],
    focusPoints: [
      "Fast-path enforcement near the request path.",
      "Appropriate algorithm choice for burst tolerance vs fairness.",
      "Sharding by identity key.",
      "Acceptable bounded inconsistency across nodes or regions.",
      "Operational simplicity under high volume."
    ],
    stages: buildStages("hld", [
      ...rateLimiterCommon.hld,
      {
        idSuffix: "rate-high-level-design",
        title: "High level design",
        prompt: "What is your high-level architecture for evaluating a request, updating counters, and enforcing limits across distributed servers?",
        guidance: "Describe the fast path and the stateful enforcement path.",
        referenceAnswer:
          "A practical HLD has an enforcement component near the request path, a counter or token state store, policy management, and optionally local caching for fast checks. The design should show how a request gets evaluated and how counters remain accurate enough.",
        expectedKeywords: ["enforcement", "counter", "policy", "cache", "request"],
        minimumWords: 28,
        isCoreFocus: true
      },
      {
        idSuffix: "rate-algorithm-and-consistency",
        title: "Algorithm choice and distributed consistency",
        prompt: "How would you choose the rate-limiting algorithm and keep enforcement accurate enough across servers and regions?",
        guidance: "Focus on tradeoffs, sharding, locality, and acceptable inconsistency.",
        referenceAnswer:
          "Choose token bucket when burst tolerance matters, sliding window when fairness matters more, and keep state sharded by identity key close to the request path. Global perfection is usually too expensive, so bounded inconsistency with reconciliation is often enough.",
        expectedKeywords: ["token bucket", "sliding window", "shard", "identity", "consistency"],
        minimumWords: 30,
        isCoreFocus: true
      }
    ])
  }
];
