declare module "react-test-renderer" {
  import type { ReactElement } from "react";

  export interface ReactTestRenderer {
    toJSON(): unknown;
    update(element: ReactElement): void;
    unmount(): void;
  }

  export function create(element: ReactElement): ReactTestRenderer;
  export function act(callback: () => void | Promise<void>): Promise<void>;
}
