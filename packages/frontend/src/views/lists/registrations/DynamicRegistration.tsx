import * as S from "@effect/schema/Schema";
import { formatError } from "@effect/schema/TreeFormatter";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import {
  AppId,
  AppWithRegistrations,
  EncodeError,
  TagADT,
  createToolInstallation,
  match,
} from "@yaltt/model";
import { Effect, Either, pipe, ReadonlyRecord } from "effect";
import { LtiMessage, LtiPlacements, PlatformConfiguration } from "lti-model";
import * as React from "react";
import { create } from "zustand";
import { WithRequest } from "../../../lib/api/WithRequest";
import { getDecode } from "../../../lib/api/request";
import { provideRequestService } from "../../../lib/api/requestServiceImpl";
import { fetchApp } from "../../../lib/apps/apps";
import { WithAuth } from "../../../lib/auth/WithAuth";
import {
  FetchException,
  FetchParseError,
  FetchParseJsonError,
  fetchBodyFromEndpoint,
} from "../../../lib/endpoint-ts/fetchFromEndpoint";
import { useParsedParamsQuery } from "../../../lib/react-router/useParsedParamsQuery";

type SelectedScopeState = {
  scopes: ReadonlyArray<string>;
  toggleScope: (scope: string) => void;
  setScopes: (scopes: ReadonlyArray<string>) => void;
};

const useScopeStore = create<SelectedScopeState>()((set) => ({
  scopes: [],
  setScopes: (scopes) => set({ scopes }),
  toggleScope: (scope) =>
    set((state) =>
      state.scopes.includes(scope)
        ? { scopes: state.scopes.filter((s) => s !== scope) }
        : { scopes: [...state.scopes, scope] }
    ),
}));

type Request<E, A> = TagADT<{
  initial: {};
  loading: {};
  loaded: { data: A };
  failed: { error: E };
}>;

type InstallingStateError =
  | FetchException
  | FetchParseError
  | FetchParseJsonError
  | EncodeError;

type InstallingState = {
  install: Request<InstallingStateError, unknown>;
  installTool: <R, A>(
    eff: Effect.Effect<A, InstallingStateError, R>
  ) => Effect.Effect<A, InstallingStateError, R>;
  setInstalling: () => Effect.Effect<void, never, never>;
  setInstallFailed: (
    err: InstallingStateError
  ) => Effect.Effect<void, never, never>;
  setInstallSucceeded: () => Effect.Effect<void, never, never>;
};

const useInstallingState = create<InstallingState>()((set) => ({
  install: { _tag: "initial" },
  installTool: (eff) =>
    pipe(
      Effect.sync(() => set((state) => ({ install: { _tag: "loading" } }))),
      Effect.flatMap(() => eff),
      Effect.tap(() =>
        Effect.sync(() =>
          set((state) => ({ install: { _tag: "loaded", data: {} } }))
        )
      ),
      Effect.tapError((err) =>
        Effect.sync(() =>
          set((state) => ({
            install: { _tag: "failed", error: err },
          }))
        )
      )
    ),
  setInstalling: () =>
    Effect.sync(() => set((state) => ({ install: { _tag: "loading" } }))),
  setInstallFailed: (err: InstallingStateError) =>
    Effect.sync(() =>
      set((state) => ({
        install: { _tag: "failed", error: err },
      }))
    ),
  setInstallSucceeded: () =>
    Effect.sync(() =>
      set((state) => ({ install: { _tag: "loaded", data: {} } }))
    ),
}));

const sendCloseMessage = Effect.sync(() => {
  (window.opener || window.parent).postMessage(
    {
      subject: "org.imsglobal.lti.close",
    },
    "*"
  );
});

const fetchOpenIdConfig = (params: {
  openid_configuration: string;
  registration_token?: string;
}) =>
  getDecode(S.unknown)(
    `/api/retrieve_openid_configuration?url=${params.openid_configuration}` +
      (params.registration_token
        ? `&registration_token=${params.registration_token}`
        : "")
  );

const fetchDynRegData = (params: {
  appId: AppId;
  openid_configuration: string;
  registration_token?: string;
}) =>
  pipe(
    fetchOpenIdConfig(params),
    Effect.bindTo("openidConfig"),
    Effect.bind("app", () => fetchApp({ appId: params.appId }))
  );

const installToolReq = fetchBodyFromEndpoint(createToolInstallation);

export const DynamicRegistration = () => {
  const parsedParamsQuery = useParsedParamsQuery(
    S.struct({
      appId: S.compose(S.NumberFromString, AppId),
    }),
    S.struct({
      openid_configuration: S.string,
      registration_token: S.optional(S.string),
    })
  );

  const [topCustomParams, setTopCustomParams] = React.useState("");
  const [toolId, setToolId] = React.useState(
    "toolid-" + Math.floor(Math.random() * 1000)
  );
  const scopes = useScopeStore((state) => state.scopes);
  const placements = usePlacementsStore((state) => state.placements);

  const { install, installTool } = useInstallingState((state) => state);

  return (
    <WithAuth>
      {(user) =>
        pipe(
          parsedParamsQuery,
          Either.match({
            onRight: ({ params, query }) => (
              <WithRequest
                eff={fetchDynRegData({ ...query, appId: params.appId })}
              >
                {({ openidConfig, app }) =>
                  pipe(
                    S.decodeEither(PlatformConfiguration)(openidConfig, {
                      onExcessProperty: "ignore",
                    }),
                    Either.match({
                      onLeft: (errors) => (
                        <div className="flex flex-col items-center w-full">
                          <article className="prose">
                            <h3>Error retrieving OpenID Configuration from:</h3>
                            <pre>{query.openid_configuration}</pre>
                            <h3>Raw Response Body</h3>
                            <pre>{JSON.stringify(openidConfig, null, 2)}</pre>
                            <h3>Parse Error:</h3>
                            <pre>{formatError(errors)}</pre>
                          </article>
                        </div>
                      ),
                      onRight: (platformConfiguration) => (
                        <div className="flex flex-col items-center w-full">
                          <article className="prose mt-5">
                            <h1 className="text-center">
                              Installing {app.name} into "
                              {
                                (openidConfig as any)[
                                  "https://purl.imsglobal.org/spec/lti-platform-configuration"
                                ][
                                  "https://canvas.instructure.com/lti/account_name"
                                ]
                              }
                              "
                            </h1>

                            <MessageTypes
                              platformConfiguration={platformConfiguration}
                              app={app}
                            />
                            <div className="divider"></div>
                            <ServicesSupported
                              platformConfiguration={platformConfiguration}
                            />
                            <div className="divider"></div>
                            <div>
                              <h3>Other Configuration Options</h3>
                              <div className="form-control">
                                <label htmlFor="custom-parameters">
                                  Custom Parameters
                                </label>
                                <textarea
                                  id="custom-parameters"
                                  className="textarea textarea-bordered"
                                  placeholder="Custom Parameters (key=value format)"
                                  onChange={(ev) =>
                                    setTopCustomParams(ev.currentTarget.value)
                                  }
                                  value={topCustomParams}
                                ></textarea>
                                <label htmlFor="tool-id" className="mt-3">
                                  Toolid
                                </label>
                                <input
                                  id="tool-id"
                                  type="text"
                                  className="input input-bordered mb-3"
                                  onChange={(ev) =>
                                    setToolId(ev.currentTarget.value?.trim())
                                  }
                                  value={toolId}
                                />
                              </div>
                            </div>

                            <div className="w-full flex justify-end flex-row">
                              <button
                                className="btn btn-primary"
                                onClick={() => {
                                  pipe(
                                    installToolReq(params)({
                                      customParameters:
                                        parseCustomParams(topCustomParams),
                                      platformConfiguration:
                                        platformConfiguration,
                                      registrationToken:
                                        query.registration_token,
                                      registrationEndpoint:
                                        platformConfiguration.registration_endpoint,
                                      scopes,
                                      toolId,
                                      messages: Object.entries(placements)
                                        .filter(([, p]) => p.enabled)
                                        .map(
                                          ([key, p]): LtiMessage => ({
                                            type: p.message_type,
                                            custom_parameters:
                                              parseCustomParams(
                                                p.custom_parameters
                                              ),
                                            label: p.label,
                                            icon_uri: p.icon_uri,
                                            roles: p.roles
                                              .split(",")
                                              .map((s) => s.trim())
                                              .filter((s) => s !== ""),
                                            placements: [key],
                                            // target_link_uri: `${window.location.origin}/api/apps/${params.appId}/launch?placement=${key}`,
                                          })
                                        ),
                                    }),
                                    installTool,
                                    Effect.flatMap(() => sendCloseMessage),
                                    provideRequestService,
                                    Effect.runCallback
                                  );
                                }}
                                disabled={pipe(
                                  install,
                                  match({
                                    initial: () => false,
                                    loading: () => true,
                                    loaded: () => true,
                                    failed: () => false,
                                  })
                                )}
                              >
                                {pipe(
                                  install,
                                  match({
                                    initial: () => "Install",
                                    loading: () => "Installing...",
                                    loaded: () => "Installed",
                                    failed: (err) => "Failed (Try Again)",
                                  })
                                )}
                              </button>
                            </div>
                            {pipe(
                              install,
                              match({
                                initial: () => <></>,
                                loading: () => <></>,
                                loaded: () => <></>,
                                failed: ({ error }) => (
                                  <div className="w-full flex justify-end flex-col">
                                    {pipe(
                                      error,
                                      match({
                                        fetch_exception: (fe) => (
                                          <>
                                            <div>Error fetching {fe.url}</div>
                                            <pre>
                                              {JSON.stringify(
                                                fe.reason,
                                                null,
                                                2
                                              )}
                                            </pre>
                                          </>
                                        ),
                                        fetch_parse_json_error: (pe) => (
                                          <>
                                            <div>Unable to parse json:</div>
                                            <pre>{pe.original}</pre>
                                            <div>Error:</div>
                                            <pre>
                                              {JSON.stringify(pe.error)}
                                            </pre>
                                          </>
                                        ),
                                        fetch_parse_error: (pe) => (
                                          <>
                                            <div>Error parsing response:</div>
                                            <pre>{formatError(pe.reason)}</pre>
                                            <div>Original data response:</div>
                                            <pre>
                                              {JSON.stringify(
                                                pe.original,
                                                null,
                                                2
                                              )}
                                            </pre>
                                          </>
                                        ),
                                        encode_error: (ee) => (
                                          <>
                                            <div>Error Encoding data:</div>
                                            <pre>{formatError(ee.error)}</pre>
                                            <div>Original encode:</div>
                                            <pre>
                                              {JSON.stringify(
                                                ee.actual,
                                                null,
                                                2
                                              )}
                                            </pre>
                                          </>
                                        ),
                                      })
                                    )}
                                  </div>
                                ),
                              })
                            )}
                            <div className="divider"></div>

                            <h3>Raw Platform Configuration</h3>

                            <pre>{JSON.stringify(openidConfig, null, 2)}</pre>
                            <h6>Fetched from:</h6>
                            <pre>{query.openid_configuration}</pre>
                          </article>
                        </div>
                      ),
                    })
                  )
                }
              </WithRequest>
            ),
            onLeft: (err) => (
              <div>
                error
                <pre>{formatError(err)}</pre>{" "}
              </div>
            ),
          })
        )
      }
    </WithAuth>
  );
};

const ServicesSupported = (props: {
  platformConfiguration: PlatformConfiguration;
}) => {
  const { scopes, toggleScope, setScopes } = useScopeStore((state) => state);

  React.useEffect(() => {
    setScopes(props.platformConfiguration.scopes_supported);
  }, []);

  return (
    <div>
      <h3>Services Supported by this Platform</h3>
      <div className="list-none pl-0 grid grid-cols-2 gap-2">
        {PossibleScopes.map((ps) => ({
          ...ps,
          supported:
            typeof props.platformConfiguration.scopes_supported.find(
              (scope) => {
                return scope === ps.type;
              }
            ) !== "undefined",
        })).map((ps) => (
          <div className="form-control" key={ps.type}>
            <label className="label cursor-pointer justify-normal">
              <input
                type="checkbox"
                className="checkbox"
                onChange={() => toggleScope(ps.type)}
                checked={scopes.includes(ps.type)}
              />
              <span className="label-text ml-2">{ps.description}</span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
};

const PossibleScopes = [
  {
    type: "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
    description: "Manage Gradebook Columns",
  },
  {
    type: "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly",
    description: "Read Gradebook Columns",
  },
  {
    type: "https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly",
    description: "Read Student Submissions",
  },
  {
    type: "https://purl.imsglobal.org/spec/lti-ags/scope/score",
    description: "Create Student Submissions",
  },
  {
    type: "https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly",
    description: "Read Course Membership",
  },
  {
    type: "https://canvas.instructure.com/lti/public_jwk/scope/update",
    description: "Update Public JWK",
  },
  {
    type: "https://canvas.instructure.com/lti/account_lookup/scope/show",
    description: "Lookup Accounts",
  },
  {
    type: "https://canvas.instructure.com/lti-ags/progress/scope/show",
    description: "Read Student Progress",
  },
];

type Placements = Record<
  string,
  {
    enabled: boolean;
    message_type: string;
    custom_parameters: string;
    icon_uri: string;
    roles: string;
    label: string;
  }
>;

type InputType = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

type PlacementsStore = {
  placements: Placements;
  togglePlacement: (placement: string) => void;
  setPlacements: (placments: Placements) => void;
  updateLabel: (
    placement: string
  ) => (event: React.ChangeEvent<InputType>) => void;
  updateMessageType: (
    placement: string
  ) => (message_type: React.ChangeEvent<InputType>) => void;
  updateCustomParameters: (
    placement: string
  ) => (custom_parameters: React.ChangeEvent<InputType>) => void;
  updateIconUri: (
    placement: string
  ) => (icon_uri: React.ChangeEvent<InputType>) => void;
  updateRoles: (
    placement: string
  ) => (roles: React.ChangeEvent<InputType>) => void;
};

const updatePlacement =
  (
    key: string,
    set: (f: (p: PlacementsStore) => Partial<PlacementsStore>) => void
  ) =>
  (placementType: string) =>
  (event: React.ChangeEvent<InputType>) =>
    set((state) => ({
      placements: {
        ...state.placements,
        [placementType]: {
          ...state.placements[placementType],
          [key]: event.currentTarget.value,
        },
      },
    }));

const usePlacementsStore = create<PlacementsStore>()((set) => ({
  placements: {},
  togglePlacement: (placement: string) =>
    set((state) => {
      return {
        placements: {
          ...state.placements,
          [placement]: {
            ...state.placements[placement],
            enabled: !state.placements[placement].enabled,
          },
        },
      };
    }),
  setPlacements: (placements: Placements) => set((state) => ({ placements })),
  updateMessageType: updatePlacement("message_type", set),
  updateLabel: updatePlacement("label", set),
  updateCustomParameters: updatePlacement("custom_parameters", set),
  updateIconUri: updatePlacement("icon_uri", set),
  updateRoles: updatePlacement("roles", set),
}));

type ExpandedPlacementsState = {
  expanded: boolean;
  toggleExpanded: () => void;
};

const useExpandedPlacementsStore = create<ExpandedPlacementsState>()((set) => ({
  expanded: false,
  toggleExpanded: () => set((state) => ({ expanded: !state.expanded })),
}));

const MessageTypes = (props: {
  platformConfiguration: PlatformConfiguration;
  app: AppWithRegistrations;
}) => {
  const ltiPlatformConfig =
    props.platformConfiguration[
      "https://purl.imsglobal.org/spec/lti-platform-configuration"
    ];

  const { expanded, toggleExpanded } = useExpandedPlacementsStore(
    (state) => state
  );

  const advertisedPlacements = ltiPlatformConfig.messages_supported
    .flatMap((m) => m.placements || [])
    .filter((p) => p !== "resource_selection")
    .filter((item, i, ar) => ar.indexOf(item) === i)
    .map((p) => ({
      type: p,
      message_types: ltiPlatformConfig.messages_supported
        .filter((m) => (m.placements || []).includes(p))
        .map((m) => m.type),
      description:
        KnownPlacements.find((kp) => kp.type === p)?.description || p,
    }))
    .sort((a, b) => {
      const aIndex = KnownPlacements.findIndex((kp) => kp.type === a.type);
      const bIndex = KnownPlacements.findIndex((kp) => kp.type === b.type);
      return aIndex - bIndex;
    });

  const {
    placements,
    togglePlacement,
    setPlacements,
    updateCustomParameters,
    updateIconUri,
    updateLabel,
    updateMessageType,
    updateRoles,
  } = usePlacementsStore((state) => state);

  const unAdvertisedPlacements = pipe(
    LtiPlacements,
    ReadonlyRecord.filter(
      (p) => !advertisedPlacements.find((ap) => ap.type === p)
    ),
    ReadonlyRecord.map((a, b) => {
      if (a === "ContentArea") {
        return {
          type: "ContentArea",
          message_types: ["LtiResourceLinkRequest"],
          description: "Content Area",
        };
      } else if (a === "RichTextEditor") {
        return {
          type: "RichTextEditor",
          message_types: ["LtiDeepLinkingRequest"],
          description: "Rich Text Editor",
        };
      } else {
        const hmm: never = a;
        return hmm;
      }
    }),
    ReadonlyRecord.values
  );

  React.useEffect(() => {
    setPlacements({
      ...advertisedPlacements.reduce((acc: Placements, placement) => {
        return {
          ...acc,
          [placement.type]: {
            enabled: false,
            message_type:
              // Prefer LtiDeepLinkingRequest if it's available
              placement.message_types.includes("LtiDeepLinkingRequest")
                ? "LtiDeepLinkingRequest"
                : placement.message_types[0],
            custom_parameters: "foo=bar\ncontext_id=$Context.id",
            icon_uri: `${window.location.origin}/api/apps/${props.app.id}/icon.svg`,
            roles: "",
            label: `${props.app.name} (${placement.description})`,
          },
        };
      }, {}),

      ...unAdvertisedPlacements.reduce((acc: Placements, placement) => {
        return {
          ...acc,
          [placement.type]: {
            enabled: false,
            message_type: placement.message_types[0],
            custom_parameters: "foo=bar\ncontext_id=$Context.id",
            icon_uri: `${window.location.origin}/api/apps/${props.app.id}/icon.svg`,
            roles: "",
            label: `${props.app.name} (${placement.description})`,
          },
        };
      }, {}),
    });
  }, []);

  /**
   * Determines the number of placements to display by default
   * hiding the rest behind a "show more" button
   */
  const DefaultPlacementDisplayCount = 5;

  // if the number of all placements is less than 6, show all
  // and don't show the "show more" button

  // if the number of all placements is more than 6, show the first 5

  // if we are expanded, or the number of placements is less than 6, show all

  return (
    <div>
      <h3>Placements</h3>
      {advertisedPlacements.length > 0 ? (
        <>
          <h6>Supported by this Platform</h6>
          {advertisedPlacements.map((placement, i) =>
            !expanded && i > DefaultPlacementDisplayCount ? null : (
              <>
                {/* <pre>{JSON.stringify(placement, null, 2)}</pre> */}
                <PlacementConfig placement={placement} />
              </>
            )
          )}
        </>
      ) : null}
      {unAdvertisedPlacements.length > 0 &&
      (expanded ||
        unAdvertisedPlacements.length + advertisedPlacements.length <=
          DefaultPlacementDisplayCount) ? (
        <>
          <h6>Standard placements not advertised as supported</h6>
          {unAdvertisedPlacements.length > 0 && (
            <>
              {unAdvertisedPlacements.map((placement, i) =>
                !expanded && i > DefaultPlacementDisplayCount ? null : (
                  // <pre>{JSON.stringify(placement, null, 2)}</pre>
                  <PlacementConfig placement={placement} />
                )
              )}
            </>
          )}
        </>
      ) : null}

      <div
        className="w-full items-center justify-center flex flex-row cursor-pointer"
        onClick={() => {
          toggleExpanded();
        }}
      >
        {expanded ? (
          <>
            Show Less <ChevronUpIcon className="ml-2 w-5 h-5" />
          </>
        ) : (
          <>
            Show More <ChevronDownIcon className="ml-2 w-5 h-5" />
          </>
        )}
      </div>
    </div>
  );
};

const PossibleMessageTypes = [
  {
    type: "LtiResourceLinkRequest",
  },
  {
    type: "LtiDeepLinkingRequest",
  },
];

// type: S.string,
// target_link_uri: S.optional(Url),
// custom_parameters: S.optional(CustomParameters),
// icon_uri: S.optional(S.string),
// placements: S.optional(S.array(S.string)),
// roles: S.optional(S.array(S.string)),

const KnownPlacements = [
  { type: "global_navigation", description: "Global Navigation" },
  { type: "homework_submission", description: "Homework Submission" },
  { type: "link_selection", description: "Link Selection" },
  { type: "course_navigation", description: "Course Navigation" },
  { type: "account_navigation", description: "Account Navigation" },
  { type: "editor_button", description: "Editor Button" },
  { type: "assignment_edit", description: "Assignment Edit" },
  { type: "assignment_group_menu", description: "Assignment Group Menu" },
  { type: "assignment_index_menu", description: "Assignment Index Menu" },
  { type: "assignment_menu", description: "Assignment Menu" },
  { type: "assignment_selection", description: "Assignment Selection" },
  { type: "assignment_view", description: "Assignment View" },
  { type: "collaboration", description: "Collaboration" },
  { type: "conference_selection", description: "Conference Selection" },
  { type: "course_assignments_menu", description: "Course Assignments Menu" },
  {
    type: "course_home_sub_navigation",
    description: "Course Home Sub-Navigation",
  },
  {
    type: "course_settings_sub_navigation",
    description: "Course Settings Sub-Navigation",
  },
  {
    type: "discussion_topic_index_menu",
    description: "Discussion Topic Index Menu",
  },
  { type: "discussion_topic_menu", description: "Discussion Topic Menu" },
  { type: "file_index_menu", description: "File Index Menu" },
  { type: "file_menu", description: "File Menu" },
  { type: "migration_selection", description: "Migration Selection" },
  { type: "module_group_menu", description: "Module Group Menu" },
  { type: "module_index_menu", description: "Module Index Menu" },
  { type: "module_index_menu_modal", description: "Module Index Menu Modal" },
  { type: "module_menu_modal", description: "Module Menu Modal" },
  { type: "module_menu", description: "Module Menu" },
  { type: "post_grades", description: "Post Grades" },
  { type: "quiz_index_menu", description: "Quiz Index Menu" },
  { type: "quiz_menu", description: "Quiz Menu" },
  { type: "similarity_detection", description: "Similarity Detection" },
  { type: "student_context_card", description: "Student Context Card" },
  {
    type: "submission_type_selection",
    description: "Submission Type Selection",
  },
  { type: "tool_configuration", description: "Tool Configuration" },
  { type: "user_navigation", description: "User Navigation" },
  { type: "wiki_index_menu", description: "Wiki Index Menu" },
  { type: "wiki_page_menu", description: "Wiki Page Menu" },
] as const;

const parseCustomParams = (custom_parameters: string): Record<string, string> =>
  custom_parameters
    .split("\n")
    .filter((s) => s.trim() !== "")
    .map((s) => s.split("="))
    .reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: value,
      }),
      {}
    );

const PlacementConfig = (props: {
  placement: {
    type: string;
    message_types: string[];
    description: string;
  };
}) => {
  const placement = props.placement;

  const {
    placements,
    togglePlacement,
    setPlacements,
    updateCustomParameters,
    updateIconUri,
    updateLabel,
    updateMessageType,
    updateRoles,
  } = usePlacementsStore((state) => state);

  return (
    <div className="form-control" key={placement.type}>
      <label className="label cursor-pointer justify-normal">
        <input
          type="checkbox"
          className="checkbox"
          onChange={() => togglePlacement(placement.type)}
          checked={
            typeof placements[placement.type] !== "undefined" &&
            placements[placement.type].enabled === true
          }
        />
        <span className="label-text ml-2">{placement.description}</span>
      </label>
      {typeof placements[placement.type] !== "undefined" &&
        placements[placement.type].enabled === true && (
          <div className="ml-10 grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Label"
              className="input input-bordered w-full max-w-xs"
              onChange={updateLabel(placement.type)}
              value={placements[placement.type].label}
            />
            <select
              className="select select-bordered w-full max-w-xs"
              disabled={placement.message_types.length === 1}
              onChange={updateMessageType(placement.type)}
            >
              {placement.message_types.map((mt) => (
                <option key={mt}>{mt}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Roles"
              className="input input-bordered w-full max-w-xs"
              onChange={updateRoles(placement.type)}
              value={placements[placement.type].roles}
            />
            <input
              type="text"
              placeholder="Icon Url"
              className="input input-bordered w-full max-w-xs"
              onChange={updateIconUri(placement.type)}
              value={placements[placement.type].icon_uri}
            />
            <textarea
              className="textarea textarea-bordered"
              placeholder="Custom Parameters (key=value format)"
              onChange={updateCustomParameters(placement.type)}
              value={placements[placement.type].custom_parameters}
            ></textarea>
          </div>
        )}
    </div>
  );
};
