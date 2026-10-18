import { breadcrumbsSizes, sizes } from "@moonx/ui-tokens";
import { Breadcrumb, Breadcrumbs } from "../components/Breadcrumbs";
import { Accordion, Disclosure } from "../components/Disclosure";
import { Tab, TabList, TabPanel, Tabs } from "../components/Tabs";
import { Text } from "../components/Text";
import { Flex, Stack } from "../layout/Flex";
import { Section, Specimen } from "./parts";

export function DisclosureSection() {
  return (
    <Section title="Disclosure and Accordion">
      <Specimen name="Disclosure size S / M / L / XL">
        <Stack gap="space-200">
          {sizes.map((size) => (
            <Disclosure key={size} size={size} title={`EXAMPLE ${size}`}>
              <Text elementType="p">
                They buy boxed piaya at the airport on the way home.
              </Text>
            </Disclosure>
          ))}
        </Stack>
      </Specimen>
      <Specimen name="isQuiet (titles inline: ▸ EXAMPLE ▸ Related research)">
        <Flex gap="space-200" wrap alignItems="start">
          <Disclosure isQuiet defaultExpanded title="EXAMPLE">
            <Text elementType="p">They buy boxed piaya at the airport.</Text>
          </Disclosure>
          <Disclosure isQuiet title="Related research (2)">
            <Text elementType="p">Interview: Ana, Sep 30</Text>
          </Disclosure>
        </Flex>
      </Specimen>
      <Specimen name="Accordion (one open at a time)">
        <Accordion defaultExpandedKeys={["thread-1"]}>
          <Disclosure id="thread-1" title="Resolved thread: pricing">
            <Text elementType="p">Agreed on ₱250 per box.</Text>
          </Disclosure>
          <Disclosure id="thread-2" title="Resolved thread: supplier">
            <Text elementType="p">Two bakeries quoted.</Text>
          </Disclosure>
        </Accordion>
      </Specimen>
    </Section>
  );
}

const planTabs = ["Tasks", "Milestones", "Budget", "Risks", "Launch"] as const;

export function TabsSection() {
  return (
    <Section title="Tabs">
      <Specimen name="Tabs (five, scrolling sideways when narrow)">
        <Tabs>
          <TabList aria-label="Execution">
            {planTabs.map((name) => (
              <Tab key={name} id={name}>
                {name}
              </Tab>
            ))}
          </TabList>
          {planTabs.map((name) => (
            <TabPanel key={name} id={name}>
              <Text>{`${name} of the plan.`}</Text>
            </TabPanel>
          ))}
        </Tabs>
      </Specimen>
      <Specimen name="size S / M / L / XL">
        <Stack gap="space-300">
          {sizes.map((size) => (
            <Tabs key={size} size={size}>
              <TabList aria-label={`Assumptions and risks ${size}`}>
                <Tab id="assumptions">Assumptions</Tab>
                <Tab id="risks">Risks</Tab>
              </TabList>
              <TabPanel id="assumptions">
                <Text>{`Assumptions ${size}`}</Text>
              </TabPanel>
              <TabPanel id="risks">
                <Text>{`Risks ${size}`}</Text>
              </TabPanel>
            </Tabs>
          ))}
        </Stack>
      </Specimen>
    </Section>
  );
}

export function BreadcrumbsSection() {
  return (
    <Section title="Breadcrumbs">
      <Text tone="secondary" elementType="p">
        Hidden below the tablet breakpoint: a phone shows ← and where it goes
        back to instead.
      </Text>
      {breadcrumbsSizes.map((size) => (
        <Specimen key={size} name={`size ${size}`}>
          <Breadcrumbs size={size} aria-label={`Breadcrumbs ${size}`}>
            <Breadcrumb href="#ideas">Ideas</Breadcrumb>
            <Breadcrumb href="#idea">Piaya Gift Box</Breadcrumb>
            <Breadcrumb>05 Costs</Breadcrumb>
          </Breadcrumbs>
        </Specimen>
      ))}
    </Section>
  );
}
