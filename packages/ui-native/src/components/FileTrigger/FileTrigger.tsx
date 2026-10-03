import * as DocumentPicker from "expo-document-picker";
import { cloneElement, type ReactElement, useRef } from "react";

/**
 * A file the user picked. This is the phone's counterpart of the Web part's `File`: the browser
 * hands over file objects, the phone hands over a `uri` in the app's cache (read it with
 * `fetch(uri)` or expo-file-system) plus the metadata the picker knows.
 */
export interface PickedFile {
  uri: string;
  name: string;
  /** `undefined` when the system picker does not report it. */
  mimeType: string | undefined;
  /** Bytes; `undefined` when the system picker does not report it. */
  size: number | undefined;
}

export interface FileTriggerProps {
  /** MIME types the file picker offers, such as `["image/png", "image/jpeg"]`. */
  acceptedFileTypes?: readonly string[];
  /**
   * Called with the picked files, or with `[]` if none was picked or the user cancelled (the Web
   * part does the same). Unlike the Web's `File[]`, the entries are `PickedFile`.
   */
  onSelect: (files: PickedFile[]) => void;
  /**
   * Called when the system picker fails. The Web part has no such prop because the browser's
   * picker cannot fail. Without it the error is thrown from the press handler's promise.
   */
  onError?: (error: Error) => void;
  /** The `Button` or `ActionButton` that opens the picker. It must take `onPress`. */
  children: ReactElement<{ onPress?: () => void }>;
}

/**
 * Opens the system file picker from the button it wraps. The system picker takes MIME types, not
 * extensions, so entries such as `.png` are not understood; pass MIME types. One file is picked
 * at a time, as in the Web part (no `allowsMultipleSelection`).
 */
export function FileTrigger({ acceptedFileTypes, onSelect, onError, children }: FileTriggerProps) {
  // The system rejects a second picker while one is open, so a double tap must not start one.
  const picking = useRef(false);
  const open = async () => {
    if (picking.current) return;
    picking.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: acceptedFileTypes ? [...acceptedFileTypes] : "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      onSelect(
        result.canceled
          ? []
          : result.assets.map((asset) => ({
              uri: asset.uri,
              name: asset.name,
              mimeType: asset.mimeType,
              size: asset.size,
            })),
      );
    } catch (error) {
      if (!onError) throw error;
      onError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      picking.current = false;
    }
  };
  return cloneElement(children, {
    onPress: () => {
      children.props.onPress?.();
      void open();
    },
  });
}
