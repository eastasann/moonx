import {
  Heading,
  IllustratedMessage,
  ListDetailPattern,
  Skeleton,
  Stack,
  Text,
  useBelowDesktop,
} from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ErrorState, LoadingState, NoAccessState } from "../components/states";
import { canEditIdeas, useWorkspaceRole } from "../lib/ideas";
import { useGoTo } from "../lib/navigate";
import { usePanelTarget } from "../lib/panel-target";
import { teamQuery } from "../lib/self-analysis";
import { MemberList } from "./team/MemberList";
import { SharedAnalysis } from "./team/SharedAnalysis";

function ListSkeleton() {
  return (
    <Stack gap="space-200">
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} shape="block" height="space-600" />
      ))}
    </Stack>
  );
}

/**
 * Screen 12, the self analyses the members shared with this workspace (design-spec 6.11, pattern
 * D): the Owners and Members on the left, the chosen one read-only on the right. Only an Owner or
 * a Member opens it; a Viewer gets no entry and the API refuses them.
 */
export function Team({ workspaceId, userId }: { workspaceId: string; userId?: string }) {
  const { t } = useTranslation("selfAnalysis");
  const role = useWorkspaceRole(workspaceId);
  const compact = useBelowDesktop();
  const goTo = useGoTo();
  const team = useQuery({ ...teamQuery(workspaceId), enabled: canEditIdeas(role) });
  // The comment buttons sit on each answer; the header has none of its own here.
  usePanelTarget(null);

  if (!canEditIdeas(role)) return <NoAccessState />;

  const members = team.data?.items ?? [];
  const anyShared = members.some((member) => member.shared);
  const open = (id: string) => goTo(`/w/${workspaceId}/team/${id}`);

  const list = () => {
    if (team.isPending) {
      return <LoadingState skeleton={<ListSkeleton />} onRetry={() => void team.refetch()} />;
    }
    if (team.isError) return <ErrorState error={team.error} onRetry={() => void team.refetch()} />;
    return <MemberList members={members} selectedId={userId} onSelect={open} />;
  };

  const detail = () => {
    if (userId) {
      return (
        <SharedAnalysis
          key={userId}
          workspaceId={workspaceId}
          userId={userId}
          onBack={compact ? () => goTo(`/w/${workspaceId}/team`) : undefined}
        />
      );
    }
    if (team.isSuccess && !anyShared) {
      return <IllustratedMessage icon={Users} heading={t("team.empty")} />;
    }
    return <Text tone="secondary">{t("team.choose")}</Text>;
  };

  return (
    <ListDetailPattern
      header={<Heading level={1}>{t("team.title")}</Heading>}
      list={list()}
      detail={detail()}
      detailOpen={compact && userId !== undefined}
    />
  );
}
