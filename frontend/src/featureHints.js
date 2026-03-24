/**
 * Plain-language labels and guidance for the Wisconsin Breast Cancer feature set.
 * Keys match `feature_names` returned by the /model_info API.
 */
export const FEATURE_HINTS = {
  "mean perimeter": {
    title: "Average cell outline length",
    hint: "The average distance around the edge of all cell nuclei in the image. Think of it like measuring the perimeter of a shape — larger values mean bigger, more spread-out cells.",
    unit: "μm",
    exampleRange: "Typical range: 43 – 189",
  },
  "mean concave points": {
    title: "Average outline indentations",
    hint: "How many times, on average, the cell edge curves inward. Irregular, deeply indented outlines can be a sign of abnormal cell growth.",
    unit: "",
    exampleRange: "Typical range: 0.000 – 0.201",
  },
  "worst radius": {
    title: "Largest cell radius observed",
    hint: "Among the most unusual-looking cells in the image, this is the radius of the largest one. Larger values suggest more irregular cell sizes.",
    unit: "μm",
    exampleRange: "Typical range: 7.9 – 36.0",
  },
  "worst perimeter": {
    title: "Largest cell outline observed",
    hint: "The biggest perimeter found among the most abnormal cells. Pairs with worst radius to describe the largest cells in the sample.",
    unit: "μm",
    exampleRange: "Typical range: 50 – 251",
  },
  "worst concave points": {
    title: "Strongest indentations observed",
    hint: "The most extreme inward dips found in the most irregular cells. Higher values indicate very jagged, abnormal-looking cell outlines.",
    unit: "",
    exampleRange: "Typical range: 0.000 – 0.291",
  },
};

export function hintForFeature(apiName) {
  const h = FEATURE_HINTS[apiName];
  if (h) {
    return {
      title: h.title,
      hint: h.hint,
      unit: h.unit || "",
      exampleRange: h.exampleRange || "",
      technical: apiName,
    };
  }
  const pretty = apiName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: pretty,
    hint: "Enter the numeric value from your dataset for this measurement.",
    unit: "",
    exampleRange: "",
    technical: apiName,
  };
}

export function friendlyOutcomeLabel(apiLabel, confidenceLevel) {
  const key = String(apiLabel).toLowerCase();

  if (confidenceLevel === "uncertain") {
    return {
      headline: "Result is inconclusive",
      detail:
        "The model cannot confidently lean either way with these values. Try the example numbers to see a clearer result.",
      tone: "neutral",
      icon: "◎",
    };
  }

  if (key === "benign") {
    return {
      headline: "Pattern leans benign",
      detail:
        "In the training data, this combination of measurements more often matched non-cancerous tissue samples.",
      tone: "calm",
      icon: "○",
    };
  }
  if (key === "malignant") {
    return {
      headline: "Pattern leans malignant",
      detail:
        "In the training data, this combination more often matched cancerous tissue samples. This is a demo only — not a real diagnosis.",
      tone: "alert",
      icon: "●",
    };
  }
  return {
    headline: `Model result: ${apiLabel}`,
    detail: "See the probability breakdown below.",
    tone: "neutral",
    icon: "◉",
  };
}
