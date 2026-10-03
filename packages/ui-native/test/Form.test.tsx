import { fireEvent, render, screen } from "@testing-library/react-native";
import { Button } from "../src/components/Button";
import { Form, useFormSubmit } from "../src/components/Form";
import { TextArea } from "../src/components/TextArea";
import { TextField } from "../src/components/TextField";

function SubmitButton() {
  const submit = useFormSubmit();
  return <Button onPress={submit}>Save</Button>;
}

test("is a named form landmark that holds its fields in a column", () => {
  render(
    <Form aria-label="Profile" onSubmit={jest.fn()}>
      <TextField label="Name" />
      <TextField label="City" />
    </Form>,
  );
  const form = screen.getByLabelText("Profile");
  expect(form.props.role).toBe("form");
  expect(screen.getByLabelText("Name")).toBeTruthy();
  expect(screen.getByLabelText("City")).toBeTruthy();
  expect(form.props.style.gap).toBeGreaterThan(0);
});

test("the submit button's function calls onSubmit", () => {
  const onSubmit = jest.fn();
  render(
    <Form onSubmit={onSubmit}>
      <TextField label="Name" />
      <SubmitButton />
    </Form>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Save" }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test("calls the latest onSubmit after a re-render", () => {
  const first = jest.fn();
  const second = jest.fn();
  const { rerender } = render(
    <Form onSubmit={first}>
      <SubmitButton />
    </Form>,
  );
  rerender(
    <Form onSubmit={second}>
      <SubmitButton />
    </Form>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Save" }));
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});

test("the return key submits a form with exactly one single-line input", () => {
  const onSubmit = jest.fn();
  render(
    <Form onSubmit={onSubmit}>
      <TextField label="Name" />
      <TextArea label="About" />
    </Form>,
  );
  fireEvent(screen.getByLabelText("Name"), "submitEditing");
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test("the return key does not submit a form with several single-line inputs", () => {
  const onSubmit = jest.fn();
  render(
    <Form onSubmit={onSubmit}>
      <TextField label="Name" />
      <TextField label="City" />
    </Form>,
  );
  fireEvent(screen.getByLabelText("Name"), "submitEditing");
  expect(onSubmit).not.toHaveBeenCalled();
});

test("the field's own onSubmit still runs", () => {
  const onSubmit = jest.fn();
  const onField = jest.fn();
  render(
    <Form onSubmit={onSubmit}>
      <TextField label="Name" onSubmit={onField} />
    </Form>,
  );
  fireEvent(screen.getByLabelText("Name"), "submitEditing");
  expect(onField).toHaveBeenCalledTimes(1);
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test("a field removed from the form no longer counts", () => {
  const onSubmit = jest.fn();
  const { rerender } = render(
    <Form onSubmit={onSubmit}>
      <TextField label="Name" />
      <TextField label="City" />
    </Form>,
  );
  rerender(
    <Form onSubmit={onSubmit}>
      <TextField label="Name" />
    </Form>,
  );
  fireEvent(screen.getByLabelText("Name"), "submitEditing");
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test("useFormSubmit outside a Form fails loudly", () => {
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<SubmitButton />)).toThrow("inside a Form");
  spy.mockRestore();
});
