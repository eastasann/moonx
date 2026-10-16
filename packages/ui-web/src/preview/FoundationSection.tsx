import { useState } from "react";
import { Button } from "../components/Button";
import { Divider } from "../components/Divider";
import { Form } from "../components/Form";
import { Heading } from "../components/Heading";
import { Link } from "../components/Link";
import { ProgressCircle } from "../components/ProgressCircle";
import { Text } from "../components/Text";
import { TextArea, TextField } from "../components/TextField";
import { Well } from "../components/Well";
import { Container } from "../layout/Container";
import { Flex, Stack } from "../layout/Flex";
import { Grid } from "../layout/Grid";
import { Box, Section, Specimen } from "./parts";
import * as styles from "./preview.css";

export function LayoutSection() {
  return (
    <Section title="Layout">
      <Specimen name='Flex gap="space-200"'>
        <Flex gap="space-200" wrap>
          <Box>1</Box>
          <Box>2</Box>
          <Box>3</Box>
        </Flex>
      </Specimen>
      <Specimen name='Flex direction={{ mobile: "column", tablet: "row" }} justifyContent="space-between"'>
        <Flex
          direction={{ mobile: "column", tablet: "row" }}
          justifyContent="space-between"
          gap="space-100"
        >
          <Box>Start</Box>
          <Box>End</Box>
        </Flex>
      </Specimen>
      <Specimen name='Stack gap="space-300"'>
        <Stack gap="space-300">
          <Box>First</Box>
          <Box>Second</Box>
        </Stack>
      </Specimen>
      <Specimen name="Grid columns={{ mobile: 1, tablet: 2, desktop: 4 }}">
        <Grid columns={{ mobile: 1, tablet: 2, desktop: 4 }} gap="space-200">
          <Box>A</Box>
          <Box>B</Box>
          <Box>C</Box>
          <Box>D</Box>
        </Grid>
      </Specimen>
      <Specimen name='Container size="reading"'>
        <div className={styles.frame}>
          <Container size="reading">
            <Box>Reading column</Box>
          </Container>
        </div>
      </Specimen>
      <Specimen name="Container hasGutters={false}">
        <div className={styles.frame}>
          <Container hasGutters={false}>
            <Box>Content column without gutters</Box>
          </Container>
        </div>
      </Specimen>
    </Section>
  );
}

export function TypographySection() {
  return (
    <Section title="Typography">
      <Specimen name="Heading level 1–4, display, label">
        <Stack gap="space-200">
          <Heading level={3} variant="display">
            Think it through at night
          </Heading>
          <Heading level={1}>Heading 1: the screen title</Heading>
          <Heading level={2}>Heading 2</Heading>
          <Heading level={3}>Heading 3</Heading>
          <Heading level={4}>Heading 4</Heading>
          <Heading level={3} variant="label">
            Next steps
          </Heading>
        </Stack>
      </Specimen>
      <Specimen name="Text variant">
        <Stack gap="space-100">
          <Text>Body: the default for running text.</Text>
          <Text variant="body-long" elementType="p">
            {
              "Body long keeps line breaks.\nSari-sari sa kanto, 朝の市場, Hiligaynon: Maayong aga."
            }
          </Text>
          <Text variant="body-sm">Body small for supporting text.</Text>
          <Text variant="caption">Caption · 2h ago</Text>
          <Text variant="label">Label</Text>
          <Text variant="number">₱1,234,567.89</Text>
        </Stack>
      </Specimen>
      <Specimen name="Text tone">
        <Flex gap="space-300" wrap>
          <Text tone="primary">Primary</Text>
          <Text tone="secondary">Secondary</Text>
          <Text tone="tertiary">Tertiary</Text>
          <Text tone="negative">Negative</Text>
        </Flex>
      </Specimen>
    </Section>
  );
}

export function SurfacesSection() {
  return (
    <Section title="Divider and Well">
      <Specimen name="Divider size S / M / L">
        <Stack gap="space-300">
          <Divider size="S" />
          <Divider size="M" />
          <Divider size="L" />
        </Stack>
      </Specimen>
      <Specimen name='Divider orientation="vertical"'>
        <div className={styles.verticalRule}>
          <Box>Left</Box>
          <Divider orientation="vertical" size="S" />
          <Box>Right</Box>
        </div>
      </Specimen>
      <Specimen name="Well density regular / spacious">
        <Stack gap="space-200">
          <Well>
            <Text>Material to read together, set in a recessed block.</Text>
          </Well>
          <Well density="spacious" role="region" aria-label="Decision material">
            <Text>Spacious padding for writing screens.</Text>
          </Well>
        </Stack>
      </Specimen>
    </Section>
  );
}

export function LinkSection() {
  return (
    <Section title="Link">
      <Specimen name='variant="primary"'>
        <Link href="#link">Edit in validation</Link>
      </Specimen>
      <Specimen name='variant="secondary" (inside text)'>
        <Text elementType="p">
          Read the{" "}
          <Link variant="secondary" href="#link">
            privacy policy
          </Link>{" "}
          before you start.
        </Text>
      </Specimen>
      <Specimen name="isDisabled">
        <Link isDisabled>See all decisions</Link>
      </Specimen>
    </Section>
  );
}

export function FormSection() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <Section title="Form">
      <Specimen name='density="regular" (fields M) with validationErrors'>
        <Form
          aria-label="Regular form"
          validationErrors={errors}
          onSubmit={(event) => {
            const name = new FormData(event.currentTarget).get("ideaName");
            setErrors(
              String(name ?? "").trim() === ""
                ? { ideaName: "Enter a name." }
                : {},
            );
          }}
        >
          <TextField name="ideaName" label="Idea name" />
          <Button type="submit" variant="secondary">
            Check
          </Button>
        </Form>
      </Specimen>
      <Specimen name='size="XL" (fields and Buttons XL)'>
        <Form aria-label="Extra large form" size="XL">
          <TextField label="Business name" />
          <Button variant="secondary">Save</Button>
        </Form>
      </Specimen>
      <Specimen name='density="spacious" (fields L)'>
        <Form aria-label="Spacious form" density="spacious">
          <TextField label="Display name" width="full" />
          <TextArea label="Reason" width="full" />
          <Button>Record decision</Button>
        </Form>
      </Specimen>
    </Section>
  );
}

export function ProgressSection() {
  return (
    <Section title="ProgressCircle">
      <Specimen name="size S / M / L, indeterminate">
        <Flex gap="space-400" alignItems="center">
          <ProgressCircle size="S" isIndeterminate aria-label="Loading" />
          <ProgressCircle size="M" isIndeterminate aria-label="Loading" />
          <ProgressCircle size="L" isIndeterminate aria-label="Preparing PDF" />
        </Flex>
      </Specimen>
      <Specimen name="value 0 / 40 / 100">
        <Flex gap="space-400" alignItems="center">
          <ProgressCircle value={0} aria-label="Uploading" />
          <ProgressCircle value={40} aria-label="Uploading" />
          <ProgressCircle value={100} aria-label="Uploading" />
        </Flex>
      </Specimen>
    </Section>
  );
}
