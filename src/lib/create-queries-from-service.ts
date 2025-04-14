/* eslint-disable @typescript-eslint/no-explicit-any */
import { QueryKey } from "@tanstack/react-query";
import {
  UseMutationFnWithParams,
  UseMutationFnWithoutParams,
  createUseMutation,
} from "./create-use-mutation";
import {
  ServiceFunction,
  UseQueryFnWithParams,
  UseQueryFnWithoutParams,
  createUseQuery,
} from "./create-use-query";

type FunctionConstraint<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? T[K]
    : T[K] extends Record<string, any>
    ? FunctionConstraint<T[K]>
    : never;
};

// Helper type: Extracts first param if function has exactly one, else never
// type SingleParam<T> = T extends (arg: infer P) => any ? P : never;
// type HasSingleParam<T> = T extends (arg: any) => any ? true : false;

function generateObject<TParams, TResult>(
  expectsParams: boolean,
  key: string,
  serviceFn: any,
  queryKeyPrefix: string[]
) {
  if (expectsParams) {
    return {
      useQuery: createUseQuery({
        expectsParams: true,
        serviceFn,
        queryKey: (params: TParams) => [...queryKeyPrefix, key, params],
      }) as UseQueryFnWithParams<TParams, TResult>,

      useMutation: createUseMutation(serviceFn) as UseMutationFnWithParams<
        any,
        any
      >,

      queryKey: (params: TParams): QueryKey => [...queryKeyPrefix, key, params],
    };
  } else {
    return {
      useQuery: createUseQuery({
        expectsParams: false,
        serviceFn,
        queryKey: () => [...queryKeyPrefix, key],
      }) as UseQueryFnWithoutParams<any>,

      useMutation: createUseMutation(
        serviceFn as ServiceFunction<undefined, TResult>
      ) as UseMutationFnWithoutParams<TResult>,

      queryKey: () => [...queryKeyPrefix, key],
    };
  }
}

type ArgumentTypes<F> = F extends (args: infer A) => any ? A : never;

type ServiceToQueries<T> = {
  [K in keyof T]: T[K] extends (...args: infer P) => Promise<any> // Check if T[K] is a function
    ? P extends [] 
      ? {
          useQuery: UseQueryFnWithoutParams<T[K]>;
          useMutation: UseMutationFnWithoutParams<T[K]>;
          queryKey: () => QueryKey;
        }
      : {
          useQuery: UseQueryFnWithParams<ArgumentTypes<T[K]>, T[K]>;
          useMutation: UseMutationFnWithParams<ArgumentTypes<T[K]>, T[K]>;
          queryKey: (params?: ArgumentTypes<T[K]>) => QueryKey;
        }
    : T[K] extends object // Ensure recursion applies only to objects
      ? ServiceToQueries<T[K]>
      : never; // Handle non-object, non-function cases
};

function createQueriesFromService<T extends FunctionConstraint<T>>(
  service: T,
  queryKeyPrefix: string | string[]
): ServiceToQueries<T> {
  const queries = {} as Record<string, any>;
  const prefixKeys =
    typeof queryKeyPrefix === "string" ? [queryKeyPrefix] : queryKeyPrefix;

  Object.keys(service).forEach((key) => {
    const serviceFn = service[key as keyof T];

    if (typeof serviceFn === "function") {
      const length = serviceFn.length;
      if (length > 1) {
        throw new Error(
          `Service function "${key}" should accept at most one parameter.`
        );
      }

      queries[key] = generateObject(
        length > 0,
        key,
        serviceFn as ServiceFunction<any, any>,
        prefixKeys
      );
    } else if (typeof serviceFn === "object" && serviceFn !== null) {
      queries[key] = createQueriesFromService(serviceFn as any, [
        ...prefixKeys,
        key,
      ]);
    }
  });

  return queries as ServiceToQueries<T>;
}

export { createQueriesFromService };
