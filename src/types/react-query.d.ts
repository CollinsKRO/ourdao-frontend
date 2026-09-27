import '@tanstack/react-query'

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: {
      /**
       * The query is the primary data of the page it powers: on failure it
       * throws to the nearest error boundary (see createQueryClient) instead
       * of degrading in place.
       */
      boundary?: boolean
      /** Also toast when the query fails. */
      notifyOnError?: boolean
    }
  }
}
