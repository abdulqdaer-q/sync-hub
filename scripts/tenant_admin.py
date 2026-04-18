#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import Counter
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional
from urllib import error, parse, request


def slugify(value: str) -> str:
    normalized = "".join(char.lower() if char.isalnum() else "-" for char in value.strip())
    while "--" in normalized:
        normalized = normalized.replace("--", "-")
    return normalized.strip("-")[:48]


def compact_json(value: Any) -> str:
    return json.dumps(value, indent=2, sort_keys=True)


class SupabaseAdminError(RuntimeError):
    pass


@dataclass(frozen=True)
class BootstrapResult:
    user_id: str
    email: str
    tenant_id: str
    tenant_name: str
    tenant_slug: str
    tenant_icon: str
    role: str
    folder_name: str
    drive_root: str


class SupabaseAdminClient:
    def __init__(self, base_url: str, service_role_key: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.service_role_key = service_role_key.strip()
        if not self.base_url:
            raise ValueError("SUPABASE_URL is required")
        if not self.service_role_key:
            raise ValueError("SUPABASE_SERVICE_ROLE_KEY is required")

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: Optional[dict[str, Any]] = None,
        query: Optional[dict[str, str]] = None,
        extra_headers: Optional[dict[str, str]] = None,
    ) -> Any:
        url = f"{self.base_url}{path}"
        if query:
            url = f"{url}?{parse.urlencode(query)}"

        headers = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
        }
        if payload is not None:
            headers["Content-Type"] = "application/json"
        if extra_headers:
            headers.update(extra_headers)

        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = request.Request(url, data=body, headers=headers, method=method.upper())

        try:
            with request.urlopen(req) as response:
                raw = response.read().decode("utf-8")
                if not raw:
                    return None
                return json.loads(raw)
        except error.HTTPError as exc:
            message = exc.read().decode("utf-8", errors="replace")
            raise SupabaseAdminError(f"{method.upper()} {path} failed: {message or exc.reason}") from exc
        except error.URLError as exc:
            raise SupabaseAdminError(f"Could not reach Supabase at {self.base_url}: {exc.reason}") from exc

    def create_user(self, email: str, password: str, full_name: str = "") -> dict[str, Any]:
        payload: dict[str, Any] = {
            "email": email.strip(),
            "password": password,
            "email_confirm": True,
        }
        if full_name.strip():
            payload["user_metadata"] = {"full_name": full_name.strip()}
        return self._request("POST", "/auth/v1/admin/users", payload=payload)

    def create_tenant(self, *, name: str, slug: str, created_by: str, icon_url: str = "") -> dict[str, Any]:
        result = self._request(
            "POST",
            "/rest/v1/tenants",
            payload={
                "name": name.strip(),
                "slug": slug.strip(),
                "created_by": created_by,
                "icon_url": icon_url.strip() or None,
            },
            extra_headers={"Prefer": "return=representation"},
        )
        if not isinstance(result, list) or not result:
            raise SupabaseAdminError("Tenant insert returned no rows.")
        return result[0]

    def add_membership(self, *, tenant_id: str, user_id: str, role: str) -> dict[str, Any]:
        result = self._request(
            "POST",
            "/rest/v1/tenant_memberships",
            payload={"tenant_id": tenant_id, "user_id": user_id, "role": role, "status": "active"},
            extra_headers={"Prefer": "return=representation"},
        )
        if not isinstance(result, list) or not result:
            raise SupabaseAdminError("Membership insert returned no rows.")
        return result[0]

    def list_tenants(self) -> list[dict[str, Any]]:
        tenants = self._request(
            "GET",
            "/rest/v1/tenants",
            query={"select": "id,slug,name,icon_url,created_at,created_by", "order": "created_at.desc", "limit": "10000"},
        )
        memberships = self._request(
            "GET",
            "/rest/v1/tenant_memberships",
            query={"select": "tenant_id,user_id,role,status", "limit": "10000"},
        )
        candidates = self._request(
            "GET",
            "/rest/v1/candidates",
            query={"select": "tenant_id", "limit": "10000"},
        )
        documents = self._request(
            "GET",
            "/rest/v1/source_documents",
            query={"select": "tenant_id", "limit": "10000"},
        )

        membership_counts = Counter(row["tenant_id"] for row in memberships or [])
        candidate_counts = Counter(row["tenant_id"] for row in candidates or [])
        document_counts = Counter(row["tenant_id"] for row in documents or [])

        output: list[dict[str, Any]] = []
        for tenant in tenants or []:
            tenant_id = tenant["id"]
            output.append(
                {
                    "tenant_id": tenant_id,
                    "slug": tenant["slug"],
                    "name": tenant["name"],
                    "icon_url": tenant.get("icon_url") or "",
                    "created_at": tenant.get("created_at"),
                    "membership_count": membership_counts.get(tenant_id, 0),
                    "candidate_count": candidate_counts.get(tenant_id, 0),
                    "document_count": document_counts.get(tenant_id, 0),
                    "folder_name": tenant["slug"],
                }
            )
        return output


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Tenant and account admin utility for CV Intelligence.")
    parser.add_argument("--supabase-url", default=os.getenv("SUPABASE_URL", ""), help="Supabase project URL")
    parser.add_argument(
        "--service-role-key",
        default=os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
        help="Supabase service role key",
    )
    parser.add_argument(
        "--drive-root",
        default=os.getenv("CV_DRIVE_ROOT", "CV Intelligence"),
        help="Logical Google Drive root folder name",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("list-tenants", help="List tenants with candidate and document counts")
    list_parser.add_argument("--json", action="store_true", help="Emit JSON instead of a human-readable table")

    create_parser = subparsers.add_parser("create-tenant-account", help="Create an auth user, tenant, and owner membership")
    create_parser.add_argument("--email", required=True, help="Login email for the workspace owner")
    create_parser.add_argument("--password", required=True, help="Login password for the workspace owner")
    create_parser.add_argument("--tenant-name", required=True, help="Workspace/company display name")
    create_parser.add_argument("--tenant-slug", default="", help="Optional explicit workspace slug")
    create_parser.add_argument("--tenant-icon", default="", help="Optional tenant icon URL or asset path")
    create_parser.add_argument("--full-name", default="", help="Optional owner full name")
    create_parser.add_argument("--role", default="owner", choices=["owner", "admin", "recruiter", "viewer"])
    create_parser.add_argument("--json", action="store_true", help="Emit JSON instead of a human-readable summary")

    bulk_parser = subparsers.add_parser("bulk-create-from-csv", help="Create users and tenants from a CSV file")
    bulk_parser.add_argument("csv_path", help="CSV file with at least email,password,tenant_name,tenant_icon columns")
    bulk_parser.add_argument("--json", action="store_true", help="Emit JSON instead of a human-readable summary")

    return parser


def print_tenant_table(rows: Iterable[dict[str, Any]], drive_root: str) -> None:
    rows = list(rows)
    if not rows:
        print("No tenants found.")
        return

    headers = ("slug", "name", "members", "candidates", "documents", "icon", "drive_folder")
    table_rows = [
        (
            row["slug"],
            row["name"],
            str(row["membership_count"]),
            str(row["candidate_count"]),
            str(row["document_count"]),
            row.get("icon_url", ""),
            f"{drive_root}/{row['folder_name']}",
        )
        for row in rows
    ]
    widths = [len(header) for header in headers]
    for row in table_rows:
        widths = [max(current, len(cell)) for current, cell in zip(widths, row)]

    def emit(values: Iterable[str]) -> None:
        print("  ".join(value.ljust(width) for value, width in zip(values, widths)))

    emit(headers)
    emit("-" * width for width in widths)
    for row in table_rows:
        emit(row)


def create_tenant_account(client: SupabaseAdminClient, args: argparse.Namespace) -> BootstrapResult:
    tenant_slug = args.tenant_slug.strip() or slugify(args.tenant_name)
    if not tenant_slug:
        raise SupabaseAdminError("Could not derive a tenant slug. Pass --tenant-slug explicitly.")

    user = client.create_user(args.email, args.password, full_name=args.full_name)
    user_id = user.get("id")
    if not user_id:
        raise SupabaseAdminError("Supabase did not return a user id.")

    tenant_icon = args.tenant_icon.strip()
    tenant = client.create_tenant(name=args.tenant_name, slug=tenant_slug, created_by=user_id, icon_url=tenant_icon)
    tenant_id = tenant.get("id")
    if not tenant_id:
        raise SupabaseAdminError("Supabase did not return a tenant id.")

    client.add_membership(tenant_id=tenant_id, user_id=user_id, role=args.role)

    folder_name = tenant_slug
    return BootstrapResult(
        user_id=user_id,
        email=args.email.strip(),
        tenant_id=tenant_id,
        tenant_name=args.tenant_name.strip(),
        tenant_slug=tenant_slug,
        tenant_icon=tenant_icon,
        role=args.role,
        folder_name=folder_name,
        drive_root=args.drive_root,
    )


def load_csv_rows(csv_path: str) -> list[dict[str, str]]:
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise SupabaseAdminError("CSV file is missing a header row.")

        normalized_headers = {header.strip() for header in reader.fieldnames if header}
        required_headers = {"email", "password", "tenant_name", "tenant_icon"}
        missing = sorted(required_headers - normalized_headers)
        if missing:
            raise SupabaseAdminError(
                "CSV is missing required headers: " + ", ".join(missing)
            )

        rows: list[dict[str, str]] = []
        for row in reader:
            normalized = {str(key).strip(): str(value or "").strip() for key, value in row.items() if key}
            if not any(normalized.values()):
                continue
            rows.append(normalized)
        return rows


def build_namespace(row: dict[str, str], drive_root: str) -> argparse.Namespace:
    return argparse.Namespace(
        email=row.get("email", ""),
        password=row.get("password", ""),
        tenant_name=row.get("tenant_name", ""),
        tenant_slug=row.get("tenant_slug", ""),
        tenant_icon=row.get("tenant_icon", ""),
        full_name=row.get("full_name", ""),
        role=row.get("role", "owner") or "owner",
        drive_root=drive_root,
    )


def validate_csv_row(row: dict[str, str], row_number: int) -> None:
    missing_fields = [field for field in ("email", "password", "tenant_name") if not row.get(field, "").strip()]
    if missing_fields:
        raise SupabaseAdminError(f"Row {row_number} is missing values for: {', '.join(missing_fields)}")


def bulk_create_from_csv(client: SupabaseAdminClient, csv_path: str, drive_root: str) -> dict[str, Any]:
    rows = load_csv_rows(csv_path)
    successes: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []

    for index, row in enumerate(rows, start=2):
        try:
            validate_csv_row(row, index)
            result = create_tenant_account(client, build_namespace(row, drive_root))
            successes.append(
                {
                    "row": index,
                    "email": result.email,
                    "tenant_id": result.tenant_id,
                    "tenant_name": result.tenant_name,
                    "tenant_slug": result.tenant_slug,
                    "tenant_icon": result.tenant_icon,
                    "folder_name": result.folder_name,
                    "google_drive_folder": f"{result.drive_root}/{result.folder_name}",
                }
            )
        except Exception as exc:  # noqa: BLE001
            failures.append(
                {
                    "row": index,
                    "email": row.get("email", ""),
                    "tenant_name": row.get("tenant_name", ""),
                    "error": str(exc),
                }
            )

    return {
        "csv_path": csv_path,
        "processed": len(rows),
        "created": len(successes),
        "failed": len(failures),
        "results": successes,
        "failures": failures,
    }


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    client = SupabaseAdminClient(args.supabase_url, args.service_role_key)

    if args.command == "list-tenants":
        rows = client.list_tenants()
        if args.json:
            print(compact_json({"drive_root": args.drive_root, "tenants": rows}))
        else:
            print(f"Google Drive root: {args.drive_root}")
            print_tenant_table(rows, args.drive_root)
        return 0

    if args.command == "create-tenant-account":
        result = create_tenant_account(client, args)
        payload = {
            "user_id": result.user_id,
            "email": result.email,
            "tenant_id": result.tenant_id,
            "tenant_name": result.tenant_name,
            "tenant_slug": result.tenant_slug,
            "tenant_icon": result.tenant_icon,
            "role": result.role,
            "folder_name": result.folder_name,
            "google_drive_folder": f"{result.drive_root}/{result.folder_name}",
        }
        if args.json:
            print(compact_json(payload))
        else:
            print("Workspace created successfully.")
            print(f"Tenant: {result.tenant_name} ({result.tenant_id})")
            print(f"Slug: {result.tenant_slug}")
            if result.tenant_icon:
                print(f"Icon: {result.tenant_icon}")
            print(f"Owner email: {result.email}")
            print(f"Folder name: {result.folder_name}")
            print(f"Google Drive folder: {result.drive_root}/{result.folder_name}")
            print("")
            print("Recommended worker input:")
            print(f"  <synced-google-drive-path>/{result.drive_root}/{result.folder_name}")
        return 0

    if args.command == "bulk-create-from-csv":
        payload = bulk_create_from_csv(client, args.csv_path, args.drive_root)
        if args.json:
            print(compact_json(payload))
        else:
            print(f"Processed: {payload['processed']}")
            print(f"Created:   {payload['created']}")
            print(f"Failed:    {payload['failed']}")
            if payload["results"]:
                print("")
                print("Created workspaces:")
                for result in payload["results"]:
                    print(
                        f"  row {result['row']}: {result['tenant_name']} "
                        f"({result['tenant_slug']}) -> {result['google_drive_folder']}"
                    )
            if payload["failures"]:
                print("")
                print("Failures:")
                for failure in payload["failures"]:
                    print(
                        f"  row {failure['row']}: {failure['tenant_name'] or failure['email'] or 'unknown'} "
                        f"- {failure['error']}"
                    )
        return 0 if payload["failed"] == 0 else 2

    parser.error(f"Unsupported command: {args.command}")
    return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SupabaseAdminError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(2) from exc
