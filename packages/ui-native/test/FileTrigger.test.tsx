import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";
import { Button } from "../src/components/Button";
import { FileTrigger } from "../src/components/FileTrigger";

jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
const getDocument = jest.mocked(DocumentPicker.getDocumentAsync);

afterEach(() => getDocument.mockReset());

test("pressing the wrapped button opens the picker with the accepted types", async () => {
  getDocument.mockResolvedValue({ canceled: true, assets: null });
  const onPress = jest.fn();
  render(
    <FileTrigger acceptedFileTypes={["image/png", "image/jpeg"]} onSelect={jest.fn()}>
      <Button onPress={onPress}>Choose photo</Button>
    </FileTrigger>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Choose photo" }));
  expect(onPress).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(getDocument).toHaveBeenCalledTimes(1));
  expect(getDocument).toHaveBeenCalledWith(
    expect.objectContaining({ type: ["image/png", "image/jpeg"], multiple: false }),
  );
});

test("any type is offered when none is given", async () => {
  getDocument.mockResolvedValue({ canceled: true, assets: null });
  render(
    <FileTrigger onSelect={jest.fn()}>
      <Button>Choose</Button>
    </FileTrigger>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Choose" }));
  await waitFor(() =>
    expect(getDocument).toHaveBeenCalledWith(expect.objectContaining({ type: "*/*" })),
  );
});

test("onSelect gets uri, name, mimeType and size of the picked file", async () => {
  getDocument.mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri: "file:///cache/me.png",
        name: "me.png",
        mimeType: "image/png",
        size: 2048,
        lastModified: 1,
      },
    ],
  });
  const onSelect = jest.fn();
  render(
    <FileTrigger onSelect={onSelect}>
      <Button>Choose</Button>
    </FileTrigger>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Choose" }));
  await waitFor(() => expect(onSelect).toHaveBeenCalled());
  expect(onSelect).toHaveBeenCalledWith([
    { uri: "file:///cache/me.png", name: "me.png", mimeType: "image/png", size: 2048 },
  ]);
});

test("cancelling reports an empty list", async () => {
  getDocument.mockResolvedValue({ canceled: true, assets: null });
  const onSelect = jest.fn();
  render(
    <FileTrigger onSelect={onSelect}>
      <Button>Choose</Button>
    </FileTrigger>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Choose" }));
  await waitFor(() => expect(onSelect).toHaveBeenCalledWith([]));
});

test("a disabled button does not open the picker", () => {
  render(
    <FileTrigger onSelect={jest.fn()}>
      <Button isDisabled>Choose</Button>
    </FileTrigger>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Choose" }));
  expect(getDocument).not.toHaveBeenCalled();
});

test("a second press while the picker is open does not start another picker", async () => {
  let finish: (value: DocumentPicker.DocumentPickerResult) => void = () => {};
  getDocument.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  render(
    <FileTrigger onSelect={jest.fn()}>
      <Button>Choose photo</Button>
    </FileTrigger>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Choose photo" }));
  fireEvent.press(screen.getByRole("button", { name: "Choose photo" }));
  expect(getDocument).toHaveBeenCalledTimes(1);
  finish({ canceled: true, assets: null });
  await waitFor(() => expect(getDocument).toHaveBeenCalledTimes(1));
  getDocument.mockResolvedValue({ canceled: true, assets: null });
  fireEvent.press(screen.getByRole("button", { name: "Choose photo" }));
  await waitFor(() => expect(getDocument).toHaveBeenCalledTimes(2));
});

test("a picker failure goes to onError", async () => {
  const failure = new Error("Different document picking in progress");
  getDocument.mockRejectedValue(failure);
  const onError = jest.fn();
  render(
    <FileTrigger onSelect={jest.fn()} onError={onError}>
      <Button>Choose photo</Button>
    </FileTrigger>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Choose photo" }));
  await waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
});
