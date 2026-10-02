/** Gallery section: Flex, Stack, Grid, Container and the layout patterns A to J (design-spec 4.1). */
import { type ReactNode, useState } from "react";
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
import { Case, Cases, Component, GallerySection } from "./parts";
import { patternFrame } from "./preview.css";

const CELLS = ["A", "B", "C", "D"] as const;

function Block({ children }: { children: ReactNode }) {
  return <Well>{children}</Well>;
}

function Pattern({ name, note, children }: { name: string; note: string; children: ReactNode }) {
  return (
    <Component name={name} note={note}>
      <div className={patternFrame}>{children}</div>
    </Component>
  );
}

function ListDetailDemo() {
  const [detailOpen, setDetailOpen] = useState(false);
  return (
    <>
      <Switch isSelected={detailOpen} onChange={setDetailOpen}>
        detailOpen (changes what shows below desktop width)
      </Switch>
      <div className={patternFrame}>
        <ListDetailPattern
          header={<Block>Header</Block>}
          list={
            <>
              <Block>Filters</Block>
              <Block>List item 1</Block>
              <Block>List item 2</Block>
            </>
          }
          detail={<Block>Detail of the chosen item</Block>}
          detailOpen={detailOpen}
        />
      </div>
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
      <Component name="Flex and Stack" note="Spacing takes token names only.">
        <Cases label="Flex row, gap space-300, wrap">
          <Flex gap="space-300" wrap padding="space-200">
            <Block>One</Block>
            <Block>Two</Block>
            <Block>Three</Block>
          </Flex>
        </Cases>
        <Cases label="Align and justify" layout="column">
          <Case label="justify between, align center">
            <Flex justify="between" align="center" gap="space-100">
              <Block>Start</Block>
              <Block>End</Block>
            </Flex>
          </Case>
          <Case label="Stack, gap space-100">
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
            <Case key={columns} label={`${columns} columns, gap space-200`}>
              <Grid columns={columns} gap="space-200">
                {CELLS.slice(0, columns).map((cell) => (
                  <Block key={cell}>Cell {cell}</Block>
                ))}
              </Grid>
            </Case>
          ))}
        </Cases>
      </Component>

      <Component name="Container">
        <Cases layout="column">
          <Case label="reading">
            <Container width="reading">
              <Block>Reading column</Block>
            </Container>
          </Case>
          <Case label="content">
            <Container width="content">
              <Block>Content width</Block>
            </Container>
          </Case>
        </Cases>
      </Component>

      <Pattern name="A. HubPattern" note="Two columns from desktop width; stacked below it.">
        <HubPattern
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
          header={<Block>Header</Block>}
          evidence={<Block>Evidence</Block>}
          actions={<Button variant="accent">Record decision</Button>}
        >
          <Block>Input</Block>
        </FocusPattern>
      </Pattern>

      <Pattern name="C. QuestionFormPattern" note="The question column.">
        <QuestionFormPattern
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

      <Component
        name="D. ListDetailPattern"
        note="Both panes from desktop width; one at a time below it."
      >
        <ListDetailDemo />
      </Component>

      <Pattern name="E. CardComparePattern" note="One, two and three columns by width.">
        <CardComparePattern header={<Block>Header</Block>} toolbar={<Block>Toolbar</Block>}>
          <Block>Card 1</Block>
          <Block>Card 2</Block>
          <Block>Card 3</Block>
        </CardComparePattern>
      </Pattern>

      <Pattern
        name="F. WorksheetPattern"
        note="The result is sticky at the right from desktop width."
      >
        <WorksheetPattern
          header={<Block>Header</Block>}
          input={<Block>Input table</Block>}
          result={<Block>Result</Block>}
          resultSummary="Result summary bar"
          resultLabel="Result"
        />
      </Pattern>

      <Pattern
        name="G. StepsPattern and DiffColumns"
        note="The diff is two columns from desktop width."
      >
        <StepsPattern
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

      <Pattern name="I. PresentationPattern" note="The thumbnail column shows from desktop width.">
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
