import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@vbaas/ui/components/button";
import { Input } from "@vbaas/ui/components/input";
import { Label } from "@vbaas/ui/components/label";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_app/api-keys")({
  component: ApiKeysPage,
});

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface ApiKeyRecord {
  createdAt: string | Date;
  enabled: boolean;
  expiresAt: string | Date | null;
  id: string;
  name: string | null;
  prefix: string | null;
  start: string | null;
}

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const getErrorMessage = (error: unknown, fallback: string) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "statusText" in error &&
    typeof error.statusText === "string"
  ) {
    return error.statusText;
  }

  return fallback;
};

const formatDate = (value: string | Date | null) => {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

function ApiKeysPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState("");
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [organizationName, setOrganizationName] = useState("");
  const [apiKeyName, setApiKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingOrganization, setIsSavingOrganization] = useState(false);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);

  const activeOrganization = useMemo(
    () =>
      organizations.find(
        (organization) => organization.id === activeOrganizationId
      ),
    [activeOrganizationId, organizations]
  );

  const loadApiKeys = useCallback(async (organizationId: string) => {
    const { data, error } = await authClient.apiKey.list({
      query: {
        organizationId,
        sortBy: "createdAt",
        sortDirection: "desc",
      },
    });

    if (error) {
      toast.error(getErrorMessage(error, "Unable to load API keys"));
      return;
    }

    setApiKeys(data?.apiKeys ?? []);
  }, []);

  const loadOrganizations = useCallback(async () => {
    setIsLoading(true);

    const [
      { data: organizationData, error },
      { data: activeOrganizationData },
    ] = await Promise.all([
      authClient.organization.list(),
      authClient.organization.getFullOrganization(),
    ]);

    if (error) {
      toast.error(getErrorMessage(error, "Unable to load organizations"));
      setIsLoading(false);
      return;
    }

    const loadedOrganizations = organizationData ?? [];
    const nextActiveOrganizationId =
      activeOrganizationData?.id ?? loadedOrganizations.at(0)?.id ?? "";

    setOrganizations(loadedOrganizations);
    setActiveOrganizationId(nextActiveOrganizationId);

    if (nextActiveOrganizationId) {
      await loadApiKeys(nextActiveOrganizationId);
    } else {
      setApiKeys([]);
    }

    setIsLoading(false);
  }, [loadApiKeys]);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  const handleOrganizationChange = async (organizationId: string) => {
    setActiveOrganizationId(organizationId);
    setCreatedKey("");
    setIsLoading(true);

    const { error } = await authClient.organization.setActive({
      organizationId,
    });

    if (error) {
      toast.error(getErrorMessage(error, "Unable to switch organization"));
      setIsLoading(false);
      return;
    }

    await loadApiKeys(organizationId);
    setIsLoading(false);
  };

  const handleCreateOrganization = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    const name = organizationName.trim();
    const slug = slugify(name);

    if (!(name && slug)) {
      toast.error("Enter an organization name");
      return;
    }

    setIsSavingOrganization(true);

    const { data, error } = await authClient.organization.create({
      name,
      slug,
    });

    if (error) {
      toast.error(getErrorMessage(error, "Unable to create organization"));
      setIsSavingOrganization(false);
      return;
    }

    setOrganizationName("");
    toast.success("Organization created");

    await loadOrganizations();

    if (data?.id) {
      await handleOrganizationChange(data.id);
    }

    setIsSavingOrganization(false);
  };

  const handleCreateApiKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!activeOrganizationId) {
      toast.error("Create or select an organization first");
      return;
    }

    const name = apiKeyName.trim();

    if (!name) {
      toast.error("Enter an API key name");
      return;
    }

    setIsCreatingKey(true);
    setCreatedKey("");

    const { data, error } = await authClient.apiKey.create({
      name,
      organizationId: activeOrganizationId,
      metadata: {
        source: "web",
      },
    });

    if (error) {
      toast.error(getErrorMessage(error, "Unable to create API key"));
      setIsCreatingKey(false);
      return;
    }

    setApiKeyName("");
    setCreatedKey(data?.key ?? "");
    toast.success("API key generated");
    await loadApiKeys(activeOrganizationId);
    setIsCreatingKey(false);
  };

  const handleCopyKey = async () => {
    if (!createdKey) {
      return;
    }

    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteApiKey = async (keyId: string) => {
    setDeletingKeyId(keyId);

    const { error } = await authClient.apiKey.delete({
      keyId,
    });

    if (error) {
      toast.error(getErrorMessage(error, "Unable to revoke API key"));
      setDeletingKeyId(null);
      return;
    }

    toast.success("API key revoked");
    await loadApiKeys(activeOrganizationId);
    setDeletingKeyId(null);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl">API Keys</h1>
        <p className="text-muted-foreground text-sm">
          Manage organization-scoped keys for server-to-server access.
        </p>
      </div>

      <section className="grid gap-4 rounded-lg border p-4 md:grid-cols-[1fr_18rem]">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            <h2 className="font-medium text-sm">Organization</h2>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="organization">Active organization</Label>
            <select
              className="h-7 w-full rounded-md border border-input bg-input/20 px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50 md:text-xs"
              disabled={isLoading || organizations.length === 0}
              id="organization"
              onChange={(event) => handleOrganizationChange(event.target.value)}
              value={activeOrganizationId}
            >
              {organizations.length === 0 ? (
                <option value="">No organizations</option>
              ) : null}
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </div>
          {activeOrganization ? (
            <p className="text-muted-foreground text-xs">
              Keys created here belong to {activeOrganization.name}.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Create an organization before generating API keys.
            </p>
          )}
        </div>

        <form className="space-y-3" onSubmit={handleCreateOrganization}>
          <div className="grid gap-2">
            <Label htmlFor="organization-name">New organization</Label>
            <Input
              id="organization-name"
              onChange={(event) => setOrganizationName(event.target.value)}
              placeholder="Acme"
              value={organizationName}
            />
          </div>
          <Button disabled={isSavingOrganization} type="submit">
            {isSavingOrganization ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Plus />
            )}
            Create
          </Button>
        </form>
      </section>

      <section className="grid gap-4 rounded-lg border p-4">
        <form
          className="grid gap-3 md:grid-cols-[1fr_auto]"
          onSubmit={handleCreateApiKey}
        >
          <div className="grid gap-2">
            <Label htmlFor="api-key-name">API key name</Label>
            <Input
              disabled={!activeOrganizationId}
              id="api-key-name"
              onChange={(event) => setApiKeyName(event.target.value)}
              placeholder="Production server"
              value={apiKeyName}
            />
          </div>
          <div className="flex items-end">
            <Button
              disabled={!activeOrganizationId || isCreatingKey}
              type="submit"
            >
              {isCreatingKey ? (
                <Loader2 className="animate-spin" />
              ) : (
                <KeyRound />
              )}
              Generate
            </Button>
          </div>
        </form>

        {createdKey ? (
          <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
            <Label htmlFor="created-api-key">New key</Label>
            <div className="flex gap-2">
              <Input
                id="created-api-key"
                readOnly
                type="password"
                value={createdKey}
              />
              <Button
                aria-label="Copy API key"
                onClick={handleCopyKey}
                size="icon"
                type="button"
                variant="outline"
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Store this key now. It will not be shown again.
            </p>
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium text-sm">Existing keys</h2>
          <Button
            disabled={!activeOrganizationId || isLoading}
            onClick={() => loadApiKeys(activeOrganizationId)}
            type="button"
            variant="outline"
          >
            <RefreshCw />
            Refresh
          </Button>
        </div>

        <ApiKeysTable
          apiKeys={apiKeys}
          deletingKeyId={deletingKeyId}
          isLoading={isLoading}
          onDeleteApiKey={handleDeleteApiKey}
        />
      </section>
    </div>
  );
}

function ApiKeysTable({
  apiKeys,
  deletingKeyId,
  isLoading,
  onDeleteApiKey,
}: {
  apiKeys: ApiKeyRecord[];
  deletingKeyId: string | null;
  isLoading: boolean;
  onDeleteApiKey: (keyId: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" />
        Loading...
      </div>
    );
  }

  if (apiKeys.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No API keys for this organization yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] text-left text-sm">
        <thead className="border-b text-muted-foreground text-xs">
          <tr>
            <th className="py-2 pr-3 font-medium">Name</th>
            <th className="py-2 pr-3 font-medium">Prefix</th>
            <th className="py-2 pr-3 font-medium">Created</th>
            <th className="py-2 pr-3 font-medium">Expires</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {apiKeys.map((apiKey) => (
            <tr className="border-b last:border-0" key={apiKey.id}>
              <td className="py-2 pr-3">{apiKey.name ?? "Untitled"}</td>
              <td className="py-2 pr-3 font-mono text-xs">
                {apiKey.start ?? apiKey.prefix ?? "Hidden"}
              </td>
              <td className="py-2 pr-3">{formatDate(apiKey.createdAt)}</td>
              <td className="py-2 pr-3">{formatDate(apiKey.expiresAt)}</td>
              <td className="py-2 pr-3">
                {apiKey.enabled ? "Enabled" : "Disabled"}
              </td>
              <td className="py-2 text-right">
                <Button
                  aria-label={`Revoke ${apiKey.name ?? "API key"}`}
                  disabled={deletingKeyId === apiKey.id}
                  onClick={() => onDeleteApiKey(apiKey.id)}
                  size="icon"
                  type="button"
                  variant="destructive"
                >
                  {deletingKeyId === apiKey.id ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Trash2 />
                  )}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
