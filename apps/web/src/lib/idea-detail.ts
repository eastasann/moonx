import { queryOptions } from "@tanstack/react-query";
import { api, call } from "./api";
import { IDEAS_KEY } from "./idea-actions";

/** I2: the idea behind a validation screen, which gives the screens its `validationId`. */
export const ideaDetailQuery = (ideaId: string) =>
  queryOptions({
    queryKey: [...IDEAS_KEY, "detail", ideaId],
    queryFn: () => call(api().api.v1.ideas({ ideaId }).get()),
  });

/** V2: one section of the question form, with an answer for every question. */
export const sectionQuery = (validationId: string, section: string, queryKey: readonly unknown[]) =>
  queryOptions({
    queryKey,
    queryFn: () =>
      call(api().api.v1.validations({ validationId }).questions({ sectionKey: section }).get()),
  });
