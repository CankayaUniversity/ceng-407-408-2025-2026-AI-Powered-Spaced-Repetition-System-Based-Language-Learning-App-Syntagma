import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders scaffold message", () => {
    render(<App />);
    expect(screen.getByText("Syntagma Extension")).toBeInTheDocument();
    expect(screen.getByText(/scaffold is ready/i)).toBeInTheDocument();
  });
});
