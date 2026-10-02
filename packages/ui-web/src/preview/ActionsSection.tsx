/** Gallery section: buttons, action groups, menus, links and the single-choice button groups. */
import { BUTTON_VARIANTS } from "@moonx/ui-tokens";
import { Copy, History, MessageSquare, Plus } from "lucide-react";
import { ActionButton } from "../components/ActionButton";
import { ActionGroup, ActionGroupItem } from "../components/ActionGroup";
import { ActionMenu } from "../components/ActionMenu";
import { Button } from "../components/Button";
import { ButtonGroup } from "../components/ButtonGroup";
import { Link } from "../components/Link";
import { Menu, MenuItem, MenuSection, MenuSeparator } from "../components/Menu";
import { SegmentedControl, SegmentedControlItem } from "../components/SegmentedControl";
import { ToggleButtonGroup, ToggleButtonGroupItem } from "../components/ToggleButtonGroup";
import { bySize, Case, Cases, Component, GallerySection, SIZES } from "./parts";

function Items() {
  return (
    <>
      <MenuItem id="duplicate">Duplicate</MenuItem>
      <MenuItem id="archive">Archive</MenuItem>
      <MenuItem id="move" isDisabled>
        Move (disabled)
      </MenuItem>
      <MenuSeparator />
      <MenuItem id="delete" variant="negative">
        Delete
      </MenuItem>
    </>
  );
}

export function ActionsSection() {
  return (
    <GallerySection id="actions" title="Actions">
      <Component
        name="Button"
        note="accent is for one action per screen; negative only confirms a deletion."
      >
        {BUTTON_VARIANTS.map((variant) => (
          <Cases key={variant} label={`Variant ${variant}`}>
            {bySize((size) => (
              <Button variant={variant} size={size}>
                Save
              </Button>
            ))}
            <Case label="Disabled">
              <Button variant={variant} isDisabled>
                Save
              </Button>
            </Case>
            <Case label="Pending">
              <Button variant={variant} isPending pendingLabel="Saving">
                Saving
              </Button>
            </Case>
          </Cases>
        ))}
      </Component>

      <Component name="ButtonGroup">
        <Cases label="Orientation and alignment" layout="column">
          {(["start", "center", "end"] as const).map((align) => (
            <Case key={align} label={`Horizontal, align ${align}`}>
              <ButtonGroup align={align} aria-label={`Actions aligned to ${align}`}>
                <Button variant="secondary">Cancel</Button>
                <Button variant="accent">Record decision</Button>
              </ButtonGroup>
            </Case>
          ))}
          <Case label="Vertical">
            <ButtonGroup orientation="vertical" aria-label="Stacked actions">
              <Button variant="primary">Apply</Button>
              <Button variant="secondary">Cancel</Button>
            </ButtonGroup>
          </Case>
        </Cases>
      </Component>

      <Component name="ActionButton">
        <Cases label="Text with icon, by size">
          {bySize((size) => (
            <ActionButton size={size} icon={<Plus />}>
              Add
            </ActionButton>
          ))}
        </Cases>
        <Cases label="Quiet, by size">
          {bySize((size) => (
            <ActionButton size={size} isQuiet icon={<Plus />}>
              Add
            </ActionButton>
          ))}
        </Cases>
        <Cases label="Icon only, by size">
          {bySize((size) => (
            <ActionButton size={size} icon={<MessageSquare />} aria-label="Comments" />
          ))}
        </Cases>
        <Cases label="States">
          <Case label="Text only">
            <ActionButton>Edit</ActionButton>
          </Case>
          <Case label="Disabled">
            <ActionButton isDisabled icon={<Plus />}>
              Add
            </ActionButton>
          </Case>
          <Case label="Quiet, disabled">
            <ActionButton isQuiet isDisabled icon={<History />} aria-label="History" />
          </Case>
        </Cases>
      </Component>

      <Component name="ActionGroup">
        <Cases label="Selection mode none, by size">
          {bySize((size) => (
            <ActionGroup aria-label={`Toolbar ${size}`} size={size}>
              <ActionGroupItem id="comments" icon={<MessageSquare />} aria-label="Comments" />
              <ActionGroupItem id="history" icon={<History />} aria-label="History" />
              <ActionGroupItem id="copy" icon={<Copy />}>
                Copy
              </ActionGroupItem>
            </ActionGroup>
          ))}
        </Cases>
        <Cases label="Selection and states">
          <Case label="Single, first selected">
            <ActionGroup aria-label="Single selection" selectionMode="single" defaultValue={["a"]}>
              <ActionGroupItem id="a">Cards</ActionGroupItem>
              <ActionGroupItem id="b">Table</ActionGroupItem>
            </ActionGroup>
          </Case>
          <Case label="Multiple, two selected">
            <ActionGroup
              aria-label="Multiple selection"
              selectionMode="multiple"
              defaultValue={["a", "c"]}
            >
              <ActionGroupItem id="a">Bold</ActionGroupItem>
              <ActionGroupItem id="b">Italic</ActionGroupItem>
              <ActionGroupItem id="c">Code</ActionGroupItem>
            </ActionGroup>
          </Case>
          <Case label="Quiet">
            <ActionGroup aria-label="Quiet toolbar" isQuiet>
              <ActionGroupItem id="comments" icon={<MessageSquare />} aria-label="Comments" />
              <ActionGroupItem id="history" icon={<History />} aria-label="History" />
            </ActionGroup>
          </Case>
          <Case label="One item disabled">
            <ActionGroup aria-label="Partly disabled">
              <ActionGroupItem id="a">Edit</ActionGroupItem>
              <ActionGroupItem id="b" isDisabled>
                Delete
              </ActionGroupItem>
            </ActionGroup>
          </Case>
          <Case label="Group disabled">
            <ActionGroup
              aria-label="Disabled group"
              selectionMode="single"
              defaultValue={["a"]}
              isDisabled
            >
              <ActionGroupItem id="a">Cards</ActionGroupItem>
              <ActionGroupItem id="b">Table</ActionGroupItem>
            </ActionGroup>
          </Case>
          <Case label="Vertical">
            <ActionGroup aria-label="Vertical toolbar" orientation="vertical">
              <ActionGroupItem id="comments" icon={<MessageSquare />} aria-label="Comments" />
              <ActionGroupItem id="history" icon={<History />} aria-label="History" />
            </ActionGroup>
          </Case>
        </Cases>
      </Component>

      <Component name="ActionMenu" note="Press to open; below the tablet width it opens as a tray.">
        <Cases>
          {bySize((size) => (
            <ActionMenu label={`More actions ${size}`} size={size}>
              <Items />
            </ActionMenu>
          ))}
          <Case label="Disabled">
            <ActionMenu label="More actions, disabled" isDisabled>
              <Items />
            </ActionMenu>
          </Case>
        </Cases>
      </Component>

      <Component name="Menu" note="Opens as a popover from tablet width and as a tray below it.">
        <Cases>
          <Case label="Items, separator, disabled and negative">
            <Menu trigger={<Button variant="secondary">Actions</Button>}>
              <Items />
            </Menu>
          </Case>
          <Case label="Sections">
            <Menu trigger={<Button variant="secondary">Grouped</Button>}>
              <MenuSection title="Idea">
                <MenuItem id="rename">Rename</MenuItem>
                <MenuItem id="duplicate">Duplicate</MenuItem>
              </MenuSection>
              <MenuSection title="Danger">
                <MenuItem id="delete" variant="negative">
                  Delete
                </MenuItem>
              </MenuSection>
            </Menu>
          </Case>
          <Case label="Single selection, second selected">
            <Menu
              trigger={<Button variant="secondary">Sort by</Button>}
              selectionMode="single"
              defaultSelectedKeys={["updated"]}
            >
              <MenuItem id="created">Created</MenuItem>
              <MenuItem id="updated">Updated</MenuItem>
            </Menu>
          </Case>
          <Case label="Trigger disabled">
            <Menu
              trigger={
                <Button variant="secondary" isDisabled>
                  Disabled
                </Button>
              }
            >
              <Items />
            </Menu>
          </Case>
        </Cases>
      </Component>

      <Component name="Link">
        <Cases>
          <Case label="Primary">
            <Link href="#actions">Edit in validation</Link>
          </Case>
          <Case label="Secondary">
            <Link href="#actions" variant="secondary">
              Secondary link
            </Link>
          </Case>
          <Case label="Disabled">
            <Link href="#actions" isDisabled>
              Disabled link
            </Link>
          </Case>
          <Case label="Without href (role link)">
            <Link>Press me</Link>
          </Case>
        </Cases>
      </Component>

      <Component
        name="ToggleButtonGroup"
        note="A single choice that can be cleared by pressing it again."
      >
        <Cases label="By size, middle chosen">
          {bySize((size) => (
            <ToggleButtonGroup aria-label={`F/A/U ${size}`} size={size} defaultValue="assumption">
              <ToggleButtonGroupItem value="fact" aria-label="Fact">
                F
              </ToggleButtonGroupItem>
              <ToggleButtonGroupItem value="assumption" aria-label="Assumption">
                A
              </ToggleButtonGroupItem>
              <ToggleButtonGroupItem value="unknown" aria-label="Unknown">
                U
              </ToggleButtonGroupItem>
            </ToggleButtonGroup>
          ))}
        </Cases>
        <Cases label="States">
          <Case label="Nothing chosen">
            <ToggleButtonGroup aria-label="F/A/U none">
              <ToggleButtonGroupItem value="fact" aria-label="Fact">
                F
              </ToggleButtonGroupItem>
              <ToggleButtonGroupItem value="assumption" aria-label="Assumption">
                A
              </ToggleButtonGroupItem>
            </ToggleButtonGroup>
          </Case>
          <Case label="One item disabled">
            <ToggleButtonGroup aria-label="F/A/U partly disabled" defaultValue="fact">
              <ToggleButtonGroupItem value="fact" aria-label="Fact">
                F
              </ToggleButtonGroupItem>
              <ToggleButtonGroupItem value="assumption" aria-label="Assumption" isDisabled>
                A
              </ToggleButtonGroupItem>
            </ToggleButtonGroup>
          </Case>
          <Case label="Group disabled">
            <ToggleButtonGroup aria-label="F/A/U disabled" defaultValue="fact" isDisabled>
              <ToggleButtonGroupItem value="fact" aria-label="Fact">
                F
              </ToggleButtonGroupItem>
              <ToggleButtonGroupItem value="assumption" aria-label="Assumption">
                A
              </ToggleButtonGroupItem>
            </ToggleButtonGroup>
          </Case>
          <Case label="Vertical">
            <ToggleButtonGroup aria-label="F/A/U vertical" orientation="vertical">
              <ToggleButtonGroupItem value="fact" aria-label="Fact">
                F
              </ToggleButtonGroupItem>
              <ToggleButtonGroupItem value="assumption" aria-label="Assumption">
                A
              </ToggleButtonGroupItem>
            </ToggleButtonGroup>
          </Case>
        </Cases>
      </Component>

      <Component name="SegmentedControl" note="One segment is always chosen.">
        <Cases label="By size, first chosen">
          {SIZES.map((size) => (
            <Case key={size} label={`Size ${size}`}>
              <SegmentedControl aria-label={`Confidence ${size}`} size={size} defaultValue="low">
                <SegmentedControlItem value="low">Low</SegmentedControlItem>
                <SegmentedControlItem value="medium">Medium</SegmentedControlItem>
                <SegmentedControlItem value="high">High</SegmentedControlItem>
              </SegmentedControl>
            </Case>
          ))}
        </Cases>
        <Cases label="States">
          <Case label="One segment disabled">
            <SegmentedControl aria-label="Format partly disabled" defaultValue="markdown">
              <SegmentedControlItem value="markdown">Markdown</SegmentedControlItem>
              <SegmentedControlItem value="json" isDisabled>
                JSON
              </SegmentedControlItem>
            </SegmentedControl>
          </Case>
          <Case label="Control disabled">
            <SegmentedControl aria-label="Format disabled" defaultValue="markdown" isDisabled>
              <SegmentedControlItem value="markdown">Markdown</SegmentedControlItem>
              <SegmentedControlItem value="json">JSON</SegmentedControlItem>
            </SegmentedControl>
          </Case>
          <Case label="Vertical">
            <SegmentedControl
              aria-label="Version vertical"
              defaultValue="short"
              orientation="vertical"
            >
              <SegmentedControlItem value="short">1 minute</SegmentedControlItem>
              <SegmentedControlItem value="long">5 minutes</SegmentedControlItem>
            </SegmentedControl>
          </Case>
        </Cases>
      </Component>
    </GallerySection>
  );
}
