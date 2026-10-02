import type { Me } from "@moonx/schemas";
import { Heading, InlineAlert, Picker, PickerItem, Stack } from "@moonx/ui-web";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { api, call } from "../../lib/api";
import { errorText } from "../../lib/error-text";
import { saveStatus } from "../../lib/save-status";
import { ME_KEY, useMe } from "../../lib/session";
import { timezoneOptions } from "../../lib/timezones";

const THEMES = ["system", "light", "dark"] as const;

/**
 * Screen 4, time zone and display mode. A choice saves when it is made (design-spec 6.0.2) and the
 * screen shows it at once; if the save fails the previous value comes back and the header offers a retry.
 */
export function PreferencesSection() {
  const { t } = useTranslation(["account", "app"]);
  const me = useMe();
  const queryClient = useQueryClient();
  const zones = useMemo(() => timezoneOptions(me.timezone), [me.timezone]);

  const update = useMutation({
    // Each request carries both settings as the screen shows them, so quick changes to the two
    // pickers cannot undo each other; the cache update lives in the tracked request so the
    // header's Retry, which runs it again without the mutation's callbacks, also updates the screen.
    mutationFn: (patch: Partial<Pick<Me, "timezone" | "theme">>) =>
      saveStatus.track(async () => {
        const shown = queryClient.getQueryData<Me>(ME_KEY);
        const body = { timezone: shown?.timezone, theme: shown?.theme, ...patch };
        const updated = await call(api().api.v1.me.patch(body));
        queryClient.setQueryData(ME_KEY, updated);
        return updated;
      }),
    onMutate: (patch) => {
      queryClient.setQueryData<Me>(ME_KEY, (current) =>
        current ? { ...current, ...patch } : current,
      );
    },
    // The server's account is the truth again after a failure.
    onError: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });

  return (
    <Stack gap="space-300" as="section">
      <Heading level={2}>{t("account:preferences.title")}</Heading>
      {update.error ? (
        <InlineAlert variant="negative" heading={errorText(t, update.error)} />
      ) : null}
      <Picker
        label={t("account:preferences.timezone")}
        value={me.timezone}
        onChange={(value) => value && value !== me.timezone && update.mutate({ timezone: value })}
      >
        {zones.map((zone) => (
          <PickerItem key={zone} id={zone}>
            {zone}
          </PickerItem>
        ))}
      </Picker>
      <Picker
        label={t("account:preferences.theme")}
        value={me.theme}
        onChange={(value) =>
          value && value !== me.theme && update.mutate({ theme: value as Me["theme"] })
        }
      >
        {THEMES.map((theme) => (
          <PickerItem key={theme} id={theme}>
            {t(`account:preferences.themes.${theme}`)}
          </PickerItem>
        ))}
      </Picker>
    </Stack>
  );
}
