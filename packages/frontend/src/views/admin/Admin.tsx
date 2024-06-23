import * as React from "react";
import {
  formBody,
  getDecode,
  post,
  RequestService,
} from "../../lib/api/request";
import { pipe, Either, Option, ReadonlyArray, Effect } from "effect";
import { useNavigate } from "react-router-dom";
import { useQuery } from "../../lib/react-router/useQuery";
import img from "../../img/bg.jpg";
import * as S from "@effect/schema/Schema";
import { getUsers, match, YalttUser } from "@yaltt/model";
import { WithRequest } from "../../lib/api/WithRequest";
import { confirmWithLoading } from "../../lib/confirmation/Confirm";
import { provideRequestService } from "../../lib/api/requestServiceImpl";
import { EllipsisVerticalIcon } from "@heroicons/react/24/outline";
import { YalttLayout } from "../../YalttLayout";
import { fetchFromEndpoint } from "../../lib/endpoint-ts/fetchFromEndpoint";
import { UserAvatar } from "../../lib/auth/UserAvatar";

const fetchUsers = fetchFromEndpoint(getUsers);

export const Admin = () => {
  return (
    <WithRequest eff={fetchUsers()}>
      {(users) => (
        <YalttLayout
          header={
            <div className="text-sm breadcrumbs">
              <ul>
                <li>Admin</li>
              </ul>
            </div>
          }
        >
          <div className="flex flex-col w-full">
            <div className="flex flex-1 pt-20 justify-center">
              <div className="min-w-[50%]">
                <div className="flex-1 flex w-full p-1">
                  <div className="flex-1 flex justify-start prose">
                    <h1>Users</h1>
                  </div>
                </div>
                <div className="divider"></div>
                <table className="table table-zebra">
                  {/* head */}
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Created</th>
                      <th>Login Type</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div className="flex items-center">
                            <UserAvatar user={r} />
                            <div className="ml-2">
                              {pipe(
                                r.login,
                                match({
                                  password: (l) => l.username,
                                  google: (l) => l.email,
                                })
                              )}
                            </div>
                          </div>
                        </td>
                        <td>{r.role}</td>
                        <td>{r.created.toLocaleDateString()}</td>
                        <td>
                          {pipe(
                            r.login,
                            match({
                              password: () => "password",
                              google: () => "google",
                            })
                          )}
                        </td>
                        <td>
                          <div className="flex justify-end">
                            <div className="dropdown dropdown-end">
                              <label tabIndex={0} className="">
                                <button>
                                  <EllipsisVerticalIcon className="w-5" />
                                </button>
                              </label>
                              <ul
                                tabIndex={0}
                                className="dropdown-content z-[1] menu p-2 shadow bg-base-300 rounded-box w-52"
                              >
                                <li>
                                  <a
                                    onClick={() => {
                                      pipe(
                                        confirmWithLoading({
                                          title: "Delete User?",
                                          description:
                                            "Are you sure you want to delete this user?",
                                          onSubmit: () => {
                                            console.log("deleting user");
                                            return Effect.succeed(undefined);
                                          },
                                        }),
                                        provideRequestService,
                                        Effect.runCallback
                                      );
                                    }}
                                  >
                                    Delete
                                  </a>
                                </li>
                              </ul>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </YalttLayout>
      )}
    </WithRequest>
  );
};
