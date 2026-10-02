import { Link } from "@moonx/ui-web";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Back to the screen an exchange came from; the steps of the screen have their own Back buttons. */
export function SourceBackLink({ href }: { href: string }) {
  const { t } = useTranslation("app");
  return (
    <Link href={href}>
      <ArrowLeft aria-hidden /> {t("back")}
    </Link>
  );
}
