import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useSession } from "./session";
import { Body, Button, Card, CategoryMark, Field, Notice } from "./ui";
type Category = {
  id: string;
  name: string;
  type: "income" | "expense" | "transfer";
  parentCategoryId: string | null;
  isSystem: boolean;
  isArchived: boolean;
};
export function SettingsCategories() {
  const session = useSession();
  const [rows, setRows] = useState<Category[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [type, setType] = useState<Category["type"]>("expense");
  const [parent, setParent] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [chooseGroup, setChooseGroup] = useState(false);
  const [archive, setArchive] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const pending = useRef(false);
  const path = `settings/categories?workspaceId=${encodeURIComponent(session.profileId)}&includeArchived=true`;
  useEffect(() => {
    const version = ++generation.current;
    setRows([]);
    setNames({});
    setName("");
    setParent(null);
    setArchive(null);
    setEditingGroup(null);
    setChooseGroup(false);
    setReady(false);
    setError("");
    setMessage("");
    if (!session.profileId) return;
    if (session.demo) {
      setError("Sign in to manage your categories.");
      return;
    }
    void session
      .request<{ categories: Category[] }>(path)
      .then((result) => {
        if (version !== generation.current) return;
        setRows(result.categories);
        setNames(
          Object.fromEntries(result.categories.map((c) => [c.id, c.name])),
        );
        setReady(true);
      })
      .catch((e) => {
        if (version === generation.current) setError(e.message);
      });
    return () => {
      generation.current++;
    };
  }, [session.profileId, session.demo, session.request, path]);
  const mutate = async (
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>,
  ) => {
    if (pending.current || !ready) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const version = generation.current;
    try {
      const { category } = await session.request<{ category: Category }>(path, {
        method,
        body: JSON.stringify(body),
      });
      if (version !== generation.current) return;
      setRows((current) =>
        method === "POST"
          ? [...current, category]
          : current.map((c) => (c.id === category.id ? category : c)),
      );
      setNames((current) => ({ ...current, [category.id]: category.name }));
      if (method === "POST") {
        setName("");
        setParent(null);
      }
      setArchive(null);
      setEditingGroup(null);
      setMessage(
        method === "DELETE"
          ? "Category archived. Existing transactions keep their category."
          : "Category saved.",
      );
      session.refresh();
    } catch (e) {
      if (version === generation.current)
        setError(e instanceof Error ? e.message : "Unable to save category.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const categoryRow = (category: Category) => (
    <Card key={category.id} style={{ borderRadius: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <CategoryMark name={category.name} />
        <View style={{ flex: 1 }}>
          <Field
            label="Category name"
            value={names[category.id] ?? ""}
            maxLength={80}
            editable={!busy}
            onChangeText={(value) =>
              setNames((current) => ({ ...current, [category.id]: value }))
            }
          />
        </View>
      </View>
      <Body>
        {category.type}
        {category.parentCategoryId
          ? ` · ${rows.find((c) => c.id === category.parentCategoryId)?.name ?? "Group"}`
          : " · Top level"}
      </Body>
      {!category.isSystem && !category.isArchived ? (
        <Button
          title="Change group"
          secondary
          disabled={busy}
          onPress={() =>
            setEditingGroup((current) =>
              current === category.id ? null : category.id,
            )
          }
        />
      ) : null}
      {editingGroup === category.id ? (
        <>
          <Button
            title="Top level"
            secondary
            disabled={busy}
            onPress={() =>
              void mutate("PATCH", { id: category.id, parentCategoryId: null })
            }
          />
          {rows
            .filter(
              (c) =>
                c.id !== category.id &&
                !c.isArchived &&
                !c.parentCategoryId &&
                c.type === category.type,
            )
            .map((c) => (
              <Button
                key={c.id}
                title={c.name}
                secondary
                disabled={busy}
                onPress={() =>
                  void mutate("PATCH", {
                    id: category.id,
                    parentCategoryId: c.id,
                  })
                }
              />
            ))}
        </>
      ) : null}
      <Button
        title="Save name"
        disabled={
          busy ||
          !names[category.id]?.trim() ||
          names[category.id].trim() === category.name
        }
        onPress={() =>
          void mutate("PATCH", {
            id: category.id,
            name: names[category.id].trim(),
          })
        }
      />
      <Button
        title={category.isArchived ? "Restore category" : "Archive category"}
        secondary
        disabled={busy}
        onPress={() =>
          category.isArchived
            ? void mutate("PATCH", { id: category.id, isArchived: false })
            : setArchive(category)
        }
      />
    </Card>
  );
  return (
    <>
      {!session.profileId ? (
        <Body>Choose a Profile to manage its categories.</Body>
      ) : null}
      {!ready && !error && session.profileId ? (
        <Body>Loading categories…</Body>
      ) : null}
      {rows.filter((c) => c.isSystem && !c.isArchived).map(categoryRow)}
      {ready ? (
        <Card style={{ borderRadius: 16 }}>
          <Body>Custom categories</Body>
          <Field
            label="Name"
            value={name}
            maxLength={80}
            editable={!busy}
            placeholder="e.g. Side hustle"
            onChangeText={setName}
          />
          {(["income", "expense", "transfer"] as const).map((value) => (
            <Button
              key={value}
              title={value[0].toUpperCase() + value.slice(1)}
              secondary={type !== value}
              disabled={busy}
              onPress={() => {
                setType(value);
                setParent(null);
              }}
            />
          ))}
          <Button
            title={`Group: ${rows.find((c) => c.id === parent)?.name ?? "Top level"}`}
            secondary
            disabled={busy}
            onPress={() => setChooseGroup((v) => !v)}
          />
          {chooseGroup ? (
            <>
              <Button
                title="Top level"
                secondary
                onPress={() => {
                  setParent(null);
                  setChooseGroup(false);
                }}
              />
              {rows
                .filter(
                  (c) =>
                    !c.isArchived && !c.parentCategoryId && c.type === type,
                )
                .map((c) => (
                  <Button
                    key={c.id}
                    title={c.name}
                    secondary
                    onPress={() => {
                      setParent(c.id);
                      setChooseGroup(false);
                    }}
                  />
                ))}
            </>
          ) : null}
          <Button
            title="Add category"
            disabled={busy || !name.trim()}
            onPress={() =>
              void mutate("POST", {
                name: name.trim(),
                type,
                parentCategoryId: parent,
              })
            }
          />
        </Card>
      ) : null}
      {rows.filter((c) => !c.isSystem && !c.isArchived).map(categoryRow)}
      {rows.some((c) => c.isArchived) ? <Body>Archived categories</Body> : null}
      {rows.filter((c) => c.isArchived).map(categoryRow)}
      {archive ? (
        <Card>
          <Body>
            Archive {archive.name}? It will no longer be offered for new
            transactions. Existing records keep their category.
          </Body>
          <Button
            title="Archive this category"
            disabled={busy}
            onPress={() => void mutate("DELETE", { id: archive.id })}
          />
          <Button
            title="Cancel"
            secondary
            disabled={busy}
            onPress={() => setArchive(null)}
          />
        </Card>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Body>{message}</Body> : null}
    </>
  );
}
