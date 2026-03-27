import { render, screen } from "@testing-library/react";
import { Button, Card, Alert } from "../components/ui";
import { describe, it, expect } from "vitest";

describe("UI Components", () => {
  describe("Button", () => {
    it("renders children correctly", () => {
      render(<Button>Click Me</Button>);
      expect(screen.getByText("Click Me")).toBeInTheDocument();
    });

    it("applies primary variant by default", () => {
      render(<Button>Button</Button>);
      const button = screen.getByText("Button");
      expect(button).toHaveClass("bg-medical-600");
    });

    it("applies secondary variant correctly", () => {
      render(<Button variant="secondary">Button</Button>);
      const button = screen.getByText("Button");
      expect(button).toHaveClass("bg-slate-200");
    });
  });

  describe("Card", () => {
    it("renders children correctly", () => {
      render(<Card>Card Content</Card>);
      expect(screen.getByText("Card Content")).toBeInTheDocument();
    });
  });

  describe("Alert", () => {
    it("renders title and children correctly", () => {
      render(<Alert title="Alert Title">Alert Message</Alert>);
      expect(screen.getByText("Alert Title")).toBeInTheDocument();
      expect(screen.getByText("Alert Message")).toBeInTheDocument();
    });

    it("applies warning variant correctly", () => {
      render(<Alert variant="warning">Warning</Alert>);
      const alert = screen.getByText("Warning").parentElement;
      expect(alert).toHaveClass("bg-yellow-50");
    });
  });
});
