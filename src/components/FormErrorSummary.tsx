import type { FieldError } from '@/lib/form-validation'

export function FormErrorSummary({ errors }: { errors: FieldError[] }) {
  if (errors.length === 0) return null

  return (
    <div
      role="alert"
      aria-labelledby="form-error-summary-title"
      className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
    >
      <p id="form-error-summary-title" className="font-semibold">
        Fix the following before continuing:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {errors.map((error) => (
          <li key={`${error.field}-${error.message}`}>
            <a className="underline-offset-2 hover:underline" href={`#${error.field}`}>
              {error.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
