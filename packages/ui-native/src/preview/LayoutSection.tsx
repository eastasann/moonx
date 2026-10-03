/** Gallery section: Flex, Stack, Grid, Container and the layout patterns A to J (design-spec 4.1). */
import { type ReactNode, useState } from "react";
import { ScrollView } from "react-native";
import { Button } from "../components/Button";
import { QuestionCard } from "../components/QuestionCard";
import { Slide } from "../components/Slide";
import { Switch } from "../components/Switch";
import { Well } from "../components/Well";
import {
  CardComparePattern,
  Container,
  DiffColumns,
  Flex,
  FocusPattern,
  Grid,
  HubPattern,
  ListDetailPattern,
  PresentationPattern,
  PublicPattern,
  QuestionFormPattern,
  SettingsPattern,
  Stack,
  StepsPattern,
  WorksheetPattern,
} from "../layout";
import { Case, Cases, Component, Frame, GallerySection } from "./parts";

export const LAYOUT_COVERAGE = [
  "Flex",
  "Stack",
  "Grid",
  "Container",
  "HubPattern",
  "FocusPattern",
  "QuestionFormPattern",
  "ListDetailPattern",
  "CardComparePattern",
  "WorksheetPattern",
  "StepsPattern",
  "DiffColumns",
  "SettingsPattern",
  "PresentationPattern",
  "PublicPattern",
] as const;

const CELLS = ["A", "B", "C", "D"] as const;

function Block({ children }: { children: ReactNode }) {
  return <Well>{children}</Well>;
}

function Pattern({
  name,
  note,
  includes,
  children,
}: {
  name: string;
  note: string;
  includes?: readonly string[];
  children: ReactNode;
}) {
  return (
    <Component name={name} note={note} includes={includes}>
      <Frame>{children}</Frame>
    </Component>
  );
}

function ListDetailDemo() {
  const [detailOpen, setDetailOpen] = useState(false);
  return (
    <>
      <Switch isSelected={detailOpen} onChange={setDetailOpen}>
        detailOpen (shows the detail instead of the list)
      </Switch>
      <Frame>
        <ListDetailPattern
          header={<Block>Header</Block>}
          list={
            <ScrollView>
              <Block>Filters</Block>
              <Block>List item 1</Block>
              <Block>List item 2</Block>
            </ScrollView>
          }
          detail={
            <ScrollView>
              <Block>Detail of the chosen item</Block>
            </ScrollView>
          }
          detailOpen={detailOpen}
          floatingAction={<Button variant="accent">New</Button>}
        />
      </Frame>
    </>
  );
}

const SLIDE = {
  type: "text",
  title: "Pattern I slide",
  bullets: [{ text: "Bread is sold out by 9 am" }],
  footer: { businessName: "Cebu Bakery", versionLabel: "Draft", date: "2 Oct 2026" },
  emptyLabel: "Not written yet",
} as const;

export function LayoutSection() {
  return (
    <GallerySection id="layout" title="Layout">
      <Component name="Flex" note="Spacing takes token names only." includes={["Stack"]}>
        <Cases label="Flex row, gap space-300, wrap" layout="column">
          <Flex gap="space-300" wrap padding="space-200">
            <Block>One</Block>
            <Block>Two</Block>
            <Block>Three</Block>
          </Flex>
        </Cases>
        <Cases label="Align and justify" layout="column">
          <Case label="justify between, align center" fill>
            <Flex justify="between" align="center" gap="space-100">
              <Block>Start</Block>
              <Block>End</Block>
            </Flex>
          </Case>
          <Case label="Stack, gap space-100" fill>
            <Stack gap="space-100">
              <Block>Row 1</Block>
              <Block>Row 2</Block>
            </Stack>
          </Case>
        </Cases>
      </Component>

      <Component name="Grid">
        <Cases label="Columns 2, 3 and 4" layout="column">
          {([2, 3, 4] as const).map((columns) => (
            <Case key={columns} label={`${columns} columns, gap space-200`} fill>
              <Grid columns={columns} gap="space-200">
                {CELLS.slice(0, columns).map((cell) => (
                  <Block key={cell}>{`Cell ${cell}`}</Block>
                ))}
              </Grid>
            </Case>
          ))}
        </Cases>
      </Component>

      <Component name="Container">
        <Cases layout="column">
          <Case label="reading" fill>
            <Container width="reading">
              <Block>Reading column</Block>
            </Container>
          </Case>
          <Case label="content" fill>
            <Container width="content">
              <Block>Content width</Block>
            </Container>
          </Case>
        </Cases>
      </Component>

      <Pattern name="A. HubPattern" note="One column; the actions are pinned to the bottom.">
        <HubPattern
          hasTabBar={false}
          header={<Block>Header</Block>}
          summary={<Block>Summary</Block>}
          nextSteps={<Block>Next steps</Block>}
          status={<Block>Status</Block>}
          entries={<Block>Entries</Block>}
          actions={<Button variant="accent">Record decision</Button>}
        />
      </Pattern>

      <Pattern name="B. FocusPattern" note="One centered column.">
        <FocusPattern
          hasTabBar={false}
          header={<Block>Header</Block>}
          evidence={<Block>Evidence</Block>}
          actions={<Button variant="accent">Record decision</Button>}
        >
          <Block>Input</Block>
        </FocusPattern>
      </Pattern>

      <Pattern name="C. QuestionFormPattern" note="The question column.">
        <QuestionFormPattern
          hasTabBar={false}
          header={<Block>Header</Block>}
          actions={<Button variant="secondary">Next</Button>}
        >
          <QuestionCard
            title="BEHAVIOR"
            isFocused={false}
            answer="Short answer"
            emptyLabel="Empty"
          />
          <QuestionCard title="PAIN" isFocused={false} emptyLabel="Empty" />
        </QuestionFormPattern>
      </Pattern>

      <Component name="D. ListDetailPattern" note="One pane at a time: the list, or the detail.">
        <ListDetailDemo />
      </Component>

      <Pattern name="E. CardComparePattern" note="Cards stacked in one column.">
        <CardComparePattern header={<Block>Header</Block>} toolbar={<Block>Toolbar</Block>}>
          <Block>Card 1</Block>
          <Block>Card 2</Block>
          <Block>Card 3</Block>
        </CardComparePattern>
      </Pattern>

      <Pattern
        name="F. WorksheetPattern"
        note="The result is a bar at the bottom that opens a tray with the full result."
      >
        <WorksheetPattern
          hasTabBar={false}
          header={<Block>Header</Block>}
          input={<Block>Input table</Block>}
          result={<Block>Result</Block>}
          resultSummary="Result summary bar"
          resultLabel="Result"
        />
      </Pattern>

      <Pattern
        name="G. StepsPattern"
        note="The diff is stacked, before above after."
        includes={["DiffColumns"]}
      >
        <StepsPattern
          hasTabBar={false}
          header={<Block>Header</Block>}
          steps={<Block>Step 1 of 3</Block>}
          actions={<Button>Continue</Button>}
        >
          <DiffColumns before={<Block>Before</Block>} after={<Block>After</Block>} />
        </StepsPattern>
      </Pattern>

      <Pattern name="H. SettingsPattern" note="Groups of settings in one column.">
        <SettingsPattern header={<Block>Header</Block>}>
          <Block>Group 1</Block>
          <Block>Group 2</Block>
        </SettingsPattern>
      </Pattern>

      <Pattern name="I. PresentationPattern" note="Thumbnails above the slide.">
        <PresentationPattern
          header={<Block>Header</Block>}
          thumbnails={
            <>
              <Block>1</Block>
              <Block>2</Block>
            </>
          }
        >
          <Slide {...SLIDE} />
          <Block>Speaker notes</Block>
        </PresentationPattern>
      </Pattern>

      <Pattern name="J. PublicPattern" note="A long single-column public page.">
        <PublicPattern>
          <Block>Section 1</Block>
          <Block>Section 2</Block>
        </PublicPattern>
      </Pattern>
    </GallerySection>
  );
}
