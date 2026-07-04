interface Props {
  id: string;
  history: string[];
}

/** Renders a native `<datalist>` for a text input's `list` attribute, giving free browser-native suggestions. */
export function HistoryDatalist({ id, history }: Props) {
  return (
    <datalist id={id}>
      {history.map(value => <option key={value} value={value} />)}
    </datalist>
  );
}
