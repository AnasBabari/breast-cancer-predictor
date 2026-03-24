/**
 * Plain-language labels for sklearn Wisconsin Breast Cancer feature names.
 * Keys must match `feature_names` returned by the API.
 */
export const FEATURE_HINTS = {
  "mean perimeter": {
    title: "Average distance around the cell outline",
    hint: "Think of this as the average “size around the edge” of the cells in the image. Larger values usually mean a bigger outline.",
  },
  "mean concave points": {
    title: "Average indentations in the outline",
    hint: "Counts how bumpy or “dented” the cell edge looks on average. More dips can mean a more irregular shape.",
  },
  "worst radius": {
    title: "Largest cell radius (most severe cells)",
    hint: "Among the most abnormal-looking cells, this is the largest radius measured.",
  },
  "worst perimeter": {
    title: "Largest outline (most severe cells)",
    hint: "The biggest perimeter found among the most abnormal-looking cells.",
  },
  "worst concave points": {
    title: "Strongest indentations (most severe cells)",
    hint: "How deep or sharp the outline dips are in the worst-looking cells.",
  },
};

export function hintForFeature(apiName) {
  const h = FEATURE_HINTS[apiName];
  if (h) {
    return { title: h.title, hint: h.hint, technical: apiName };
  }
  const pretty = apiName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: pretty,
    hint: "Enter the number that appears in your data for this field. (This demo uses research dataset columns.)",
    technical: apiName,
  };
}

export function friendlyOutcomeLabel(apiLabel) {
  const key = String(apiLabel).toLowerCase();
  if (key === "benign") {
    return {
      headline: "Leans toward benign (less aggressive in this dataset)",
      detail: "In the training data, this pattern more often matched benign (non-cancerous) tissue.",
      tone: "calm",
    };
  }
  if (key === "malignant") {
    return {
      headline: "Leans toward malignant (more aggressive in this dataset)",
      detail: "In the training data, this pattern more often matched malignant tissue. That does not mean a real-world diagnosis.",
      tone: "alert",
    };
  }
  return {
    headline: `Model picked: ${apiLabel}`,
    detail: "See probabilities below for both outcomes.",
    tone: "neutral",
  };
}
