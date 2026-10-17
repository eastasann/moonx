import { type ReactNode, useEffect, useState } from "react";
import { Heading } from "../components/Heading";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../components/SegmentedControl";
import { Text } from "../components/Text";
import { ToastContainer } from "../components/Toast";
import { Container } from "../layout/Container";
import { Flex, Stack } from "../layout/Flex";
import {
  ActionButtonSection,
  ButtonSection,
  ToggleSection,
} from "./ActionsSection";
import { ChoiceSection, FileAndTagSection } from "./ChoicesSection";
import {
  DescriptionListSection,
  DiffTextSection,
  MentionTextAreaSection,
  MetricTileSection,
  PanelSection,
  QuestionCardSection,
  RowListSection,
  SlideSection,
  StepsSection,
} from "./CustomSection";
import {
  AvatarSection,
  CardSection,
  FauPickerSection,
  ListViewSection,
  MeterSection,
  MoonGlyphSection,
  TableViewSection,
  TreeSection,
} from "./DataSection";
import {
  BadgeSection,
  IllustratedMessageSection,
  InlineAlertSection,
  ProgressBarSection,
  SkeletonSection,
  StatusLightSection,
  ToastSection,
} from "./FeedbackSection";
import {
  NumberFieldSection,
  SearchAndPickSection,
  TextFieldSection,
} from "./FieldsSection";
import {
  FormSection,
  LayoutSection,
  LinkSection,
  ProgressSection,
  SurfacesSection,
  TypographySection,
} from "./FoundationSection";
import { AlertBannerSection, LandingExamplesSection } from "./FrameKitSection";
import {
  FramePanelSection,
  FrameSection,
  PageFrameSection,
} from "./FrameSection";
import { MockupDataSection } from "./MockupDataSection";
import { MockupScreensSection, mockupScreens } from "./MockupScreens";
import { MockupBasicsSection } from "./MockupSection";
import {
  BreadcrumbsSection,
  DisclosureSection,
  TabsSection,
} from "./NavigationSection";
import {
  DialogSection,
  MenuSection,
  PopoverSection,
  TooltipSection,
} from "./OverlaysSection";
import {
  CardComparePatternSection,
  FocusPatternSection,
  HubPatternSection,
  ListDetailPatternSection,
  PresentationPatternSection,
  PublicPatternSection,
  QuestionFormPatternSection,
  SettingsPatternSection,
  StepsPatternSection,
  WorksheetPatternSection,
} from "./PatternsSection";
import * as styles from "./preview.css";

type Theme = "system" | "light" | "dark";
type Scale = "auto" | "medium" | "large";

/**
 * Sets `<html data-theme>` and `<html data-scale>` the way the app will (ADR-018):
 * System and Auto leave the attribute off so the OS and the pointer decide.
 */
function useDocumentAttribute(name: string, value: string | null) {
  useEffect(() => {
    const root = document.documentElement;
    if (value === null) root.removeAttribute(name);
    else root.setAttribute(name, value);
    return () => root.removeAttribute(name);
  }, [name, value]);
}

/**
 * The components of packages/ui-web in their variants, sizes and states, for
 * /dev/components (docs/03_dev-setup.md 3.3). Development only: the route does not load
 * it in a production build.
 */
export function ComponentGallery({
  screen,
  theme: screenTheme,
}: {
  /** A screen of docs/mockups to draw alone across the window (`?screen=s05-dashboard`). */
  screen?: string;
  /** With `screen`, its theme, as the mockups take it (`?theme=dark`). */
  theme?: "light" | "dark";
}) {
  const mockup =
    screen !== undefined && Object.hasOwn(mockupScreens, screen)
      ? mockupScreens[screen]
      : undefined;
  if (mockup !== undefined) {
    return (
      <MockupScreen
        name={mockup.name}
        render={mockup.render}
        theme={screenTheme}
      />
    );
  }
  return <Gallery />;
}

/** One screen of docs/mockups across the window, in the theme the URL names. */
function MockupScreen({
  name,
  render,
  theme,
}: {
  name: string;
  render: () => ReactNode;
  theme?: "light" | "dark";
}) {
  useDocumentAttribute("data-theme", theme ?? null);
  useEffect(() => {
    const previous = document.title;
    document.title = name;
    return () => {
      document.title = previous;
    };
  }, [name]);
  return (
    <>
      {render()}
      <ToastContainer />
    </>
  );
}

function Gallery() {
  useEffect(() => {
    const previous = document.title;
    document.title = "Components";
    return () => {
      document.title = previous;
    };
  }, []);
  const [theme, setTheme] = useState<Theme>("system");
  const [scale, setScale] = useState<Scale>("auto");
  const [aboveTabBar, setAboveTabBar] = useState(false);
  useDocumentAttribute("data-theme", theme === "system" ? null : theme);
  useDocumentAttribute("data-scale", scale === "auto" ? null : scale);

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Container>
          <Flex
            gap="space-300"
            wrap
            alignItems="center"
            justifyContent="space-between"
          >
            <Heading level={1}>Components</Heading>
            <Flex gap="space-300" wrap alignItems="center">
              <SegmentedControl
                aria-label="Theme"
                selectedKey={theme}
                onSelectionChange={(key) => setTheme(key as Theme)}
              >
                <SegmentedControlItem id="system">System</SegmentedControlItem>
                <SegmentedControlItem id="light">Light</SegmentedControlItem>
                <SegmentedControlItem id="dark">Dark</SegmentedControlItem>
              </SegmentedControl>
              <SegmentedControl
                aria-label="Scale"
                selectedKey={scale}
                onSelectionChange={(key) => setScale(key as Scale)}
              >
                <SegmentedControlItem id="auto">Auto</SegmentedControlItem>
                <SegmentedControlItem id="medium">Medium</SegmentedControlItem>
                <SegmentedControlItem id="large">Large</SegmentedControlItem>
              </SegmentedControl>
            </Flex>
          </Flex>
        </Container>
      </div>
      <Container elementType="main">
        <Stack>
          <Text tone="secondary" elementType="p">
            Popovers turn into trays below the tablet breakpoint: narrow the
            window to see Picker, ComboBox, DatePicker, Popover, Menu,
            ContextualHelp and Dialog change.
          </Text>
          <LayoutSection />
          <TypographySection />
          <SurfacesSection />
          <LinkSection />
          <ButtonSection />
          <ActionButtonSection />
          <ToggleSection />
          <TextFieldSection />
          <NumberFieldSection />
          <SearchAndPickSection />
          <ChoiceSection />
          <FileAndTagSection />
          <FormSection />
          <ProgressSection />
          <DialogSection />
          <PopoverSection />
          <MenuSection />
          <TooltipSection />
          <InlineAlertSection />
          <ToastSection
            aboveTabBar={aboveTabBar}
            onAboveTabBarChange={setAboveTabBar}
          />
          <ProgressBarSection />
          <SkeletonSection />
          <IllustratedMessageSection />
          <StatusLightSection />
          <BadgeSection />
          <DisclosureSection />
          <TabsSection />
          <BreadcrumbsSection />
          <TableViewSection />
          <ListViewSection />
          <CardSection />
          <TreeSection />
          <MeterSection />
          <MoonGlyphSection />
          <AvatarSection />
          <FauPickerSection />
          <MetricTileSection />
          <RowListSection />
          <DescriptionListSection />
          <QuestionCardSection />
          <DiffTextSection />
          <MentionTextAreaSection />
          <PanelSection />
          <SlideSection />
          <StepsSection />
          <AlertBannerSection />
          <LandingExamplesSection />
          <FrameSection />
          <PageFrameSection />
          <HubPatternSection />
          <FocusPatternSection />
          <QuestionFormPatternSection />
          <ListDetailPatternSection />
          <CardComparePatternSection />
          <WorksheetPatternSection />
          <StepsPatternSection />
          <SettingsPatternSection />
          <PresentationPatternSection />
          <PublicPatternSection />
          <MockupBasicsSection />
          <MockupDataSection />
          <MockupScreensSection />
        </Stack>
      </Container>
      <FramePanelSection />
      <ToastContainer aboveTabBar={aboveTabBar} />
    </div>
  );
}
