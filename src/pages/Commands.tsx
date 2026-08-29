import { useMemo, useState } from "react";
import { COMMAND_SECTIONS, type Command } from "../commandReference";

function matches(command: Command, query: string) {
  const q = query.toLowerCase();
  return command.say.toLowerCase().includes(q) || command.becomes.toLowerCase().includes(q);
}

export default function Commands() {
  const [query, setQuery] = useState("");

  const sections = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return COMMAND_SECTIONS;
    return COMMAND_SECTIONS.map((section) => ({
      ...section,
      groups: section.groups
        .map((group) => ({ ...group, commands: group.commands.filter((c) => matches(c, trimmed)) }))
        .filter((group) => group.commands.length > 0),
    })).filter((section) => section.groups.length > 0);
  }, [query]);

  return (
    <main className="page">
      <div className="hero">
        <div>
          <h1>Things you can say</h1>
          <p>
            Spoken commands OpenStream understands while you dictate, and while you edit a selection. Say them naturally,
            in the middle of a sentence.
          </p>
        </div>
      </div>

      <input
        className="field"
        type="search"
        placeholder="Filter commands…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        style={{ flex: "0 0 auto" }}
      />

      {sections.length === 0 && <p className="hint">No command matches “{query.trim()}”.</p>}

      {sections.map((section) => (
        <section key={section.title} className="group">
          <h2>{section.title}</h2>
          <p className="group-desc">{section.note}</p>
          {section.groups.map((group) => (
            <div key={group.title} style={{ marginTop: 6 }}>
              <div className="card-label">{group.title}</div>
              {group.note && <p className="cmd-group-note">{group.note}</p>}
              <div className="card">
                {group.commands.map((command) => (
                  <div className="cmd-row" key={command.say}>
                    <span className="cmd-say">{command.say}</span>
                    <span className="cmd-arrow" aria-hidden="true">
                      →
                    </span>
                    <span className={command.mono ? "cmd-becomes mono" : "cmd-becomes"}>{command.becomes}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
