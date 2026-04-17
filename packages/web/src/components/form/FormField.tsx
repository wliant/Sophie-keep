import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string) => ReactNode;
}

export function FormField({ label, hint, error, children }: FormFieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && !error ? (
        <small id={`${id}-hint`} className="muted">
          {hint}
        </small>
      ) : null}
      {error ? (
        <small id={`${id}-err`} className="error" role="alert">
          {error}
        </small>
      ) : null}
      <input type="hidden" aria-hidden="true" value={describedBy ?? ''} readOnly hidden />
    </div>
  );
}

interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  hint?: string;
  error?: string;
  onValue: (value: string) => void;
}
export function TextInput({ label, hint, error, onValue, ...rest }: TextInputProps) {
  return (
    <FormField label={label} hint={hint} error={error}>
      {(id) => (
        <input id={id} {...rest} onChange={(e) => onValue(e.target.value)} />
      )}
    </FormField>
  );
}

interface NumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'value'> {
  label: string;
  hint?: string;
  error?: string;
  value: number | '';
  onValue: (value: number | null) => void;
}
export function NumberInput({ label, hint, error, onValue, value, ...rest }: NumberInputProps) {
  return (
    <FormField label={label} hint={hint} error={error}>
      {(id) => (
        <input
          id={id}
          type="number"
          value={value}
          {...rest}
          onChange={(e) =>
            onValue(e.target.value === '' ? null : Number(e.target.value))
          }
        />
      )}
    </FormField>
  );
}

interface SelectInputProps<T extends string>
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  label: string;
  hint?: string;
  error?: string;
  value: T | '';
  onValue: (value: T | '') => void;
  options: Array<{ value: T; label: string }>;
  placeholder?: string;
}
export function SelectInput<T extends string>({
  label,
  hint,
  error,
  onValue,
  value,
  options,
  placeholder,
  ...rest
}: SelectInputProps<T>) {
  return (
    <FormField label={label} hint={hint} error={error}>
      {(id) => (
        <select
          id={id}
          value={value}
          {...rest}
          onChange={(e) => onValue(e.target.value as T | '')}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
}

interface TextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  label: string;
  hint?: string;
  error?: string;
  onValue: (value: string) => void;
}
export function TextAreaInput({ label, hint, error, onValue, ...rest }: TextAreaProps) {
  return (
    <FormField label={label} hint={hint} error={error}>
      {(id) => (
        <textarea
          id={id}
          {...rest}
          onChange={(e) => onValue(e.target.value)}
        />
      )}
    </FormField>
  );
}
