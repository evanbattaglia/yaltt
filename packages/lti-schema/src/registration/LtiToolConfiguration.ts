import * as S from "@effect/schema/Schema";
import { CustomParameters } from "../message/CustomParameters";
import { LtiMessageS } from "../message/LtiMessage";
import { Url } from "./Url";

const Domain = S.string;

export const LtiToolConfiguration = S.struct({
  domain: Domain,
  secondary_domains: S.optional(S.array(Domain)),
  deployment_id: S.optional(S.string),
  target_link_uri: Url,
  custom_parameters: S.optional(CustomParameters),
  description: Url,
  messages: S.array(LtiMessageS),
  claims: S.array(S.string),
  "https://canvas.instructure.com/lti/privacy_level": S.optional(
    S.literal("public", "anonymous", "name_only", "email_only")
  ),
  "https://canvas.instructure.com/lti/registration_config_url": S.optional(
    S.string
  ),
  "https://canvas.instructure.com/lti/tool_id": S.optional(
    S.string
  ),
});

export interface LtiToolConfiguration
  extends S.Schema.To<typeof LtiToolConfiguration> {}
