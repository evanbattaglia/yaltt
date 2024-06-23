import * as React from "react";
import * as F from "../../lib/forms/form";

import { Effect } from "effect";
import { WithRequest } from "../../lib/api/WithRequest";
import { RequestError, RequestService } from "../../lib/api/request";
import { NewEntityForm } from "./NewEntityForm";

type ListProps<
  K extends string,
  R extends Record<K, F.FormField<any, any>>,
  K2 extends string,
  R2 extends Record<K2, F.FormField<any, any>>,
  A
> = {
  entityName: string;
  newForm: F.Form<K, R>;
  editForm: F.Form<K2, R2>;
  fetchValues: Effect.Effect<readonly A[], RequestError, RequestService>;
  columns: string[];
  renderRow: (a: A) => Array<JSX.Element | string | number>;
  width?: string | number;
  onEmpty?: (openNewModal: () => void) => JSX.Element;
};

export const List = <
  K extends string,
  R extends Record<K, F.FormField<any, any>>,
  K2 extends string,
  R2 extends Record<K2, F.FormField<any, any>>,
  A
>(
  props: ListProps<K, R, K2, R2, A>
) => {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  return (
    <WithRequest eff={props.fetchValues}>
      {(values) => {
        return (
          <>
            <div className="container mx-auto px-4">
              <div className="overflow-x-auto h-full">
                {props.onEmpty && values.length === 0 ? (
                  props.onEmpty(() => {
                    dialogRef.current?.showModal();
                  })
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        {props.columns.map((c) => (
                          <th>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* row 1 */}
                      {values.map(props.renderRow).map((row) => (
                        <tr>
                          {row.map((r) => (
                            <td>{r}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <dialog ref={dialogRef} className="modal">
              <div className="modal-box">
                <NewEntityForm
                  close={() => {
                    dialogRef.current?.close();
                  }}
                  form={props.newForm}
                  entityName={props.entityName}
                />
              </div>
            </dialog>
          </>
        );
      }}
    </WithRequest>
  );
};
