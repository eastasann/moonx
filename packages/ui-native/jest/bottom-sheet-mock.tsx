/**
 * The official @gorhom/bottom-sheet mock renders a modal's children whether or not it was
 * presented, so tests could not tell an open tray from a closed one. This keeps the rest of
 * that mock (merged in setup.ts) and makes `BottomSheetModal` render only between `present()` and `dismiss()`.
 */
import { Component, createElement, type ReactNode } from "react";
import { View } from "react-native";

interface ModalProps {
  children?: ReactNode | ((opts: { data: unknown }) => ReactNode);
  onDismiss?: () => void;
  onChange?: (index: number) => void;
  footerComponent?: (props: { animatedFooterPosition: { value: number } }) => ReactNode;
  index?: number;
  accessibilityLabel?: string;
}

const mounted = new Set<BottomSheetModal>();

/** Plays a swipe down or a backdrop tap on every open sheet: it closes and reports `onDismiss`. */
export function dismissByUser(): void {
  for (const sheet of mounted) sheet.dismiss();
}

export class BottomSheetModal extends Component<ModalProps, { open: boolean; data: unknown }> {
  state = { open: false, data: undefined as unknown };

  present = (data?: unknown) => {
    this.setState({ open: true, data });
    this.props.onChange?.(this.props.index ?? 0);
  };

  dismiss = () => {
    if (!this.state.open) return;
    this.setState({ open: false });
    this.props.onChange?.(-1);
    this.props.onDismiss?.();
  };

  componentDidMount() {
    mounted.add(this);
  }

  componentWillUnmount() {
    mounted.delete(this);
  }

  close = this.dismiss;
  forceClose = this.dismiss;
  snapToIndex = () => {};
  expand = () => {};
  collapse = () => {};

  render() {
    if (!this.state.open) return null;
    const { children } = this.props;
    const content =
      typeof children === "function"
        ? createElement(children as never, { data: this.state.data })
        : children;
    return (
      <View testID="bottom-sheet">
        {content}
        {this.props.footerComponent?.({ animatedFooterPosition: { value: 0 } })}
      </View>
    );
  }
}
