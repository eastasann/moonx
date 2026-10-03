/** Gallery section: the app frame and the app-specific parts (TabBar, QuestionCard, Slide). */
import { Bell, Ellipsis, LayoutDashboard, Lightbulb, UserSearch } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { AppFrame } from "../components/AppFrame";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import { PageFrame } from "../components/PageFrame";
import { QuestionCard } from "../components/QuestionCard";
import { Slide, type SlideProps } from "../components/Slide";
import { StatusLight } from "../components/StatusLight";
import { TabBar, type TabBarItem } from "../components/TabBar";
import { Text } from "../components/Text";
import { TextArea } from "../components/TextArea";
import { Case, Cases, Component, Frame, GallerySection } from "./parts";
import { styles } from "./preview.styles";

export const APP_PARTS_COVERAGE = [
  "AppFrame",
  "PageFrame",
  "TabBar",
  "QuestionCard",
  "Slide",
] as const;

const FOOTER = { businessName: "Cebu Bakery", versionLabel: "Draft", date: "2 Oct 2026" };

const SLIDES: { label: string; props: SlideProps }[] = [
  {
    label: "title",
    props: {
      type: "title",
      title: "Cebu Bakery",
      subtitle: "Fresh bread for the neighborhood",
      footer: FOOTER,
      emptyLabel: "Not written yet",
    },
  },
  {
    label: "text, with an empty bullet",
    props: {
      type: "text",
      title: "Problem",
      bullets: [
        { text: "Bread is sold out by 9 am" },
        { text: "Nearest bakery is 3 km away" },
        { text: "", isEmpty: true },
      ],
      footer: FOOTER,
      emptyLabel: "Not written yet",
    },
  },
  {
    label: "number, with an empty figure and notes",
    props: {
      type: "number",
      title: "Numbers",
      figures: [
        { label: "Monthly revenue", value: "₱ 180,000.00" },
        { label: "Gross margin", value: "42%" },
        { label: "Break-even", value: null },
      ],
      notes: [{ text: "Based on 1,200 loaves a month" }],
      footer: FOOTER,
      emptyLabel: "Not written yet",
    },
  },
  {
    label: "table, with an empty cell, notes and the overflow notice",
    props: {
      type: "table",
      title: "Costs",
      columns: ["Item", "Kind", "Amount"],
      rows: [
        ["Rent", "Fixed", "₱ 25,000.00"],
        ["Flour", "Variable", null],
      ],
      notes: [{ text: "Rent is negotiable" }],
      footer: FOOTER,
      emptyLabel: "Not written yet",
      overflowNotice: "Too long for this slide",
    },
  },
];

function useTabItems(): TabBarItem[] {
  const [more, setMore] = useState(false);
  const [current, setCurrent] = useState("dashboard");
  const tab = (
    id: string,
    label: string,
    icon: TabBarItem["icon"],
    badge?: TabBarItem["badge"],
  ) => ({
    id,
    label,
    icon,
    badge,
    isCurrent: current === id,
    onPress: () => setCurrent(id),
  });
  return [
    tab("dashboard", "Dashboard", LayoutDashboard),
    tab("ideas", "Ideas", Lightbulb),
    tab("self", "Self Analysis", UserSearch),
    tab(
      "notifications",
      "Notifications",
      Bell,
      <Badge variant="informative" size="S">
        3
      </Badge>,
    ),
    { id: "more", label: "More", icon: Ellipsis, isExpanded: more, onPress: () => setMore(!more) },
  ];
}

function TabBarDemo({ label }: { label: string }) {
  return <TabBar aria-label={label} items={useTabItems()} />;
}

function AppFrameDemo() {
  const items = useTabItems();
  return (
    <Frame>
      <AppFrame
        tabBar={<TabBar aria-label="Primary, in the frame" items={items} />}
        banner={
          <InlineAlert
            variant="notice"
            heading="Offline: changes will be saved when you reconnect"
          />
        }
        backLink={
          <Button variant="secondary" size="S">
            Back
          </Button>
        }
        title="Piaya Gift Box"
        status={<StatusLight variant="positive">Saved</StatusLight>}
        actions={
          <Button variant="secondary" size="S">
            Comments
          </Button>
        }
      >
        <Text>Main content</Text>
      </AppFrame>
    </Frame>
  );
}

function QuestionCards() {
  const [focused, setFocused] = useState("behavior");
  const cards = [
    {
      id: "behavior",
      title: "BEHAVIOR",
      prompt: "What do customers do today?",
      answer: "They buy bread at the market before work.",
    },
    { id: "pain", title: "PAIN", prompt: "What bothers them most?", answer: "" },
    {
      id: "price",
      title: "PRICE",
      prompt: "What would they pay?",
      answer: "Around 12 pesos a loaf, maybe more for sourdough.",
    },
  ];
  return (
    <>
      {cards.map((card) => (
        <QuestionCard
          key={card.id}
          title={card.title}
          prompt={card.prompt}
          isFocused={focused === card.id}
          answer={card.answer}
          emptyLabel="Empty"
          status={
            <StatusLight variant={card.answer ? "fact" : "empty"}>
              {card.answer ? "Fact" : "Empty"}
            </StatusLight>
          }
          meta={<Badge size="S">2</Badge>}
          onFocusRequest={() => setFocused(card.id)}
        >
          <TextArea label={`Answer, ${card.title}`} defaultValue={card.answer} />
        </QuestionCard>
      ))}
    </>
  );
}

export function AppPartsSection() {
  return (
    <GallerySection id="app" title="App frame and app-specific parts">
      <Component
        name="AppFrame"
        note="The frame of every signed-in screen: header with back control, name, save state and entries, then the body, then the tab bar. The side navigation is Web only."
      >
        <Cases layout="column">
          <Case label="With a back control, a save state and an offline notice" fill>
            <AppFrameDemo />
          </Case>
        </Cases>
      </Component>

      <Component
        name="PageFrame"
        note="The main landmark of a screen without the app frame (landing, log in, onboarding). It adds no look."
      >
        <Cases layout="column">
          <Case label="Around a layout pattern" fill>
            <Frame>
              <PageFrame>
                <Text>Page content</Text>
              </PageFrame>
            </Frame>
          </Case>
        </Cases>
      </Component>

      <Component name="TabBar" note="Sits under the content of every signed-in screen.">
        <Cases layout="column">
          <Case label="Dashboard current, a badge and a More tab" fill>
            <TabBarDemo label="Primary" />
          </Case>
        </Cases>
      </Component>

      <Component name="QuestionCard" note="Press a compact card to focus it.">
        <Cases label="Focus moves between cards" layout="column">
          <QuestionCards />
        </Cases>
        <Cases label="Compact states" layout="column">
          <Case label="Unanswered" fill>
            <QuestionCard
              title="BEHAVIOR"
              isFocused={false}
              emptyLabel="Empty"
              status={<StatusLight variant="empty">Empty</StatusLight>}
            />
          </Case>
          <Case label="Answered, with markers" fill>
            <QuestionCard
              title="PRICE"
              isFocused={false}
              answer="Around 12 pesos a loaf."
              emptyLabel="Empty"
              status={<StatusLight variant="assumption">Assumption</StatusLight>}
              meta={<Badge size="S">4</Badge>}
            />
          </Case>
          <Case label="Focused with actions" fill>
            <QuestionCard
              title="PAIN"
              prompt="What bothers them most?"
              isFocused
              emptyLabel="Empty"
              status={<StatusLight variant="unknown">Unknown</StatusLight>}
              actions={
                <Button variant="secondary" size="S">
                  History
                </Button>
              }
            >
              <TextArea label="Answer, focused" />
            </QuestionCard>
          </Case>
        </Cases>
      </Component>

      <Component name="Slide" note="Always light: it reads the print tokens that the PDF uses.">
        <Cases layout="column">
          {SLIDES.map((slide) => (
            <Case key={slide.label} label={`Type ${slide.label}`} fill>
              <View style={styles.slideBox}>
                <Slide {...slide.props} />
              </View>
            </Case>
          ))}
        </Cases>
      </Component>
    </GallerySection>
  );
}
