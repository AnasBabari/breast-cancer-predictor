import { render, screen } from "@testing-library/react";
import { ResultDisplay } from "../components/ResultDisplay";
import { describe, it, expect, vi } from "vitest";

// Mock Recharts since it doesn't play well with jsdom and testing-library
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  BarChart: ({ children }) => <div>{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Cell: () => <div />,
}));

const mockResult = {
  label: "Malignant",
  probability: 0.95,
  probabilities: {
    Malignant: 0.95,
    Benign: 0.05,
  },
  top_factors: [
    { feature: "worst concave points", impact: 0.5, direction: "malignant" },
    { feature: "worst perimeter", impact: 0.3, direction: "malignant" },
  ],
  confidence_note: "Fairly confident (95%). Educational only.",
};

describe("ResultDisplay", () => {
  it("renders prediction label and probability", () => {
    render(<ResultDisplay result={mockResult} />);
    expect(screen.getByText(/MALIGNANT Prediction/i)).toBeInTheDocument();
    expect(screen.getByText(/95.0%/)).toBeInTheDocument();
  });

  it("renders top factors", () => {
    render(<ResultDisplay result={mockResult} />);
    expect(screen.getByText("worst concave points")).toBeInTheDocument();
    expect(screen.getByText("worst perimeter")).toBeInTheDocument();
  });

  it("renders confidence note", () => {
    render(<ResultDisplay result={mockResult} />);
    expect(screen.getByText(/Fairly confident/)).toBeInTheDocument();
  });
});
