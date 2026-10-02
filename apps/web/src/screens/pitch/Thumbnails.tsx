import type { PitchDeck } from "@moonx/schemas";
import { ListView, ListViewItem, Text } from "@moonx/ui-web";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { slideAnchorId } from "../../lib/pitch";

/** The slide list beside the deck. Choosing a slide (click, Enter) scrolls to it. */
export function Thumbnails({ deck }: { deck: PitchDeck }) {
  const { t } = useTranslation("pitch");
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <ListView
      aria-label={t("thumbnails.label")}
      density="compact"
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={selected ? [selected] : []}
      onSelectionChange={(keys) => {
        const [key] = keys === "all" ? [] : [...keys];
        if (key !== undefined) setSelected(String(key));
      }}
      onAction={(key) => {
        setSelected(String(key));
        document.getElementById(slideAnchorId(String(key)))?.scrollIntoView?.({ block: "start" });
      }}
    >
      {deck.slides.map((slide, index) => {
        const label = t("thumbnails.item", { n: index + 1, title: slide.title });
        return (
          <ListViewItem key={slide.key} id={slide.key} textValue={label}>
            <Text variant="body-sm" as="span">
              {label}
            </Text>
          </ListViewItem>
        );
      })}
    </ListView>
  );
}
