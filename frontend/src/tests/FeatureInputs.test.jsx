import { render, screen, fireEvent } from "@testing-library/react";
import { FeatureInputs } from "../components/FeatureInputs";
import { describe, it, expect, vi } from "vitest";

const mockFeatureNames = ["mean perimeter", "mean concave points"];
const mockFeatureBounds = {
  "mean perimeter": [40, 210],
  "mean concave points": [0, 0.23],
};
const mockValues = {
  "mean perimeter": 100,
  "mean concave points": 0.1,
};
const mockPresets = {
  malignant_like: {
    "mean perimeter": 122.8,
    "mean concave points": 0.1471,
  },
};

describe("FeatureInputs", () => {
  it("renders feature names correctly", () => {
    render(
      <FeatureInputs
        featureNames={mockFeatureNames}
        featureBounds={mockFeatureBounds}
        values={mockValues}
        setValues={vi.fn()}
        busy={false}
        onPredict={vi.fn()}
        onReset={vi.fn()}
        presets={mockPresets}
      />
    );
    expect(screen.getByText("mean perimeter")).toBeInTheDocument();
    expect(screen.getByText("mean concave points")).toBeInTheDocument();
  });

  it("calls setValues when a range input changes", () => {
    const setValues = vi.fn();
    render(
      <FeatureInputs
        featureNames={mockFeatureNames}
        featureBounds={mockFeatureBounds}
        values={mockValues}
        setValues={setValues}
        busy={false}
        onPredict={vi.fn()}
        onReset={vi.fn()}
        presets={mockPresets}
      />
    );
    const inputs = screen.getAllByRole("slider");
    fireEvent.change(inputs[0], { target: { value: "150" } });
    expect(setValues).toHaveBeenCalled();
  });

  it("calls onPredict when analyze button is clicked", () => {
    const onPredict = vi.fn();
    render(
      <FeatureInputs
        featureNames={mockFeatureNames}
        featureBounds={mockFeatureBounds}
        values={mockValues}
        setValues={vi.fn()}
        busy={false}
        onPredict={onPredict}
        onReset={vi.fn()}
        presets={mockPresets}
      />
    );
    fireEvent.click(screen.getByText("Generate Prediction"));
    expect(onPredict).toHaveBeenCalled();
  });

  it("disables button when busy", () => {
    render(
      <FeatureInputs
        featureNames={mockFeatureNames}
        featureBounds={mockFeatureBounds}
        values={mockValues}
        setValues={vi.fn()}
        busy={true}
        onPredict={vi.fn()}
        onReset={vi.fn()}
        presets={mockPresets}
      />
    );
    expect(screen.getByText("Analyzing...")).toBeDisabled();
  });
});
