/** Gallery section: the app-specific parts (SideNav, TabBar, QuestionCard, Slide). */
import { Bell, Ellipsis, LayoutDashboard, Lightbulb, Settings, UserSearch } from "lucide-react";
import { useState } from "react";
import { Avatar } from "../components/Avatar";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { QuestionCard } from "../components/QuestionCard";
import { SideNav, type SideNavItem } from "../components/SideNav";
import { Slide, type SlideProps } from "../components/Slide";
import { StatusLight } from "../components/StatusLight";
import { TabBar, type TabBarItem } from "../components/TabBar";
import { TextArea } from "../components/TextArea";
import { Case, Cases, Component, GallerySection } from "./parts";
import { navFrame, slideBox } from "./preview.css";

const NAV_ITEMS: SideNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "#app", icon: LayoutDashboard, isCurrent: true },
  { id: "ideas", label: "Ideas", href: "#app", icon: Lightbulb },
  { id: "self", label: "Self Analysis", href: "#app", icon: UserSearch },
  {
    id: "notifications",
    label: "Notifications",
    href: "#app",
    icon: Bell,
    badge: (
      <Badge variant="informative" size="S">
        3
      </Badge>
    ),
  },
];

const SECONDARY: SideNavItem[] = [
  { id: "settings", label: "Settings", href: "#app", icon: Settings },
];

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

function SideNavDemo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className={navFrame}>
      <SideNav
        aria-label={collapsed ? "Main, collapsed" : "Main"}
        items={NAV_ITEMS}
        secondaryItems={SECONDARY}
        isCollapsed={collapsed}
        workspaceSwitcher={({ isCollapsed }) => (
          <Button variant="secondary" size="S">
            {isCollapsed ? "W" : "My workspace"}
          </Button>
        )}
        userMenu={({ isCollapsed }) =>
          isCollapsed ? <Avatar name="Maria Santos" size="S" /> : <Avatar name="Maria Santos" />
        }
      />
    </div>
  );
}

function TabBarDemo() {
  const [more, setMore] = useState(false);
  const items: TabBarItem[] = [
    { id: "dashboard", label: "Dashboard", href: "#app", icon: LayoutDashboard, isCurrent: true },
    { id: "ideas", label: "Ideas", href: "#app", icon: Lightbulb },
    { id: "self", label: "Self Analysis", href: "#app", icon: UserSearch },
    {
      id: "notifications",
      label: "Notifications",
      href: "#app",
      icon: Bell,
      badge: (
        <Badge variant="informative" size="S">
          3
        </Badge>
      ),
    },
    { id: "more", label: "More", icon: Ellipsis, isExpanded: more, onPress: () => setMore(!more) },
  ];
  return <TabBar aria-label="Primary" items={items} />;
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
          onNavigate={(direction) => {
            const index = cards.findIndex((c) => c.id === focused);
            const next = cards[direction === "next" ? index + 1 : index - 1];
            if (next) setFocused(next.id);
          }}
        >
          <TextArea label="Answer" defaultValue={card.answer} />
        </QuestionCard>
      ))}
    </>
  );
}

export function AppPartsSection() {
  return (
    <GallerySection id="app" title="App frame and app-specific parts">
      <Component
        name="SideNav"
        note="Full width from desktop, icons only at tablet widths, hidden below the tablet width."
      >
        <Cases label="Follows the window width, and forced collapsed">
          <Case label="Automatic">
            <SideNavDemo />
          </Case>
          <Case label="isCollapsed">
            <SideNavDemo collapsed />
          </Case>
        </Cases>
      </Component>

      <Component
        name="TabBar"
        note="Fixed to the bottom edge of the window; visible only below the tablet width. Narrow the window to see it."
      >
        <TabBarDemo />
      </Component>

      <Component
        name="QuestionCard"
        note="Press a compact card, or use Ctrl+ArrowDown / Ctrl+ArrowUp."
      >
        <Cases label="Focus moves between cards" layout="column">
          <QuestionCards />
        </Cases>
        <Cases label="Compact states" layout="column">
          <Case label="Unanswered">
            <QuestionCard
              title="BEHAVIOR"
              isFocused={false}
              emptyLabel="Empty"
              status={<StatusLight variant="empty">Empty</StatusLight>}
            />
          </Case>
          <Case label="Answered, with markers">
            <QuestionCard
              title="PRICE"
              isFocused={false}
              answer="Around 12 pesos a loaf."
              emptyLabel="Empty"
              status={<StatusLight variant="assumption">Assumption</StatusLight>}
              meta={<Badge size="S">4</Badge>}
            />
          </Case>
          <Case label="Focused with actions">
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
              <TextArea label="Answer" />
            </QuestionCard>
          </Case>
        </Cases>
      </Component>

      <Component name="Slide" note="Always light: it reads the print tokens that the PDF uses.">
        <Cases layout="column">
          {SLIDES.map((slide) => (
            <Case key={slide.label} label={`Type ${slide.label}`}>
              <div className={slideBox}>
                <Slide {...slide.props} />
              </div>
            </Case>
          ))}
        </Cases>
      </Component>
    </GallerySection>
  );
}
