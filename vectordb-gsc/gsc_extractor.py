import os
import json
import time
from datetime import datetime, timedelta
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn, TimeElapsedColumn
from rich.table import Table
from rich import box

import config

console = Console()


def authenticate():
    if not os.path.exists(config.SERVICE_ACCOUNT_FILE):
        console.print(Panel(
            f"[bold red]Service account file not found:[/bold red] {config.SERVICE_ACCOUNT_FILE}\n\n"
            "1. Create a service account at [cyan]https://console.cloud.google.com/iam-admin/serviceaccounts[/cyan]\n"
            "2. Download the JSON key file\n"
            "3. Set [green]SERVICE_ACCOUNT_FILE[/green] in your .env",
            title="[bold red]Authentication Error[/bold red]",
            border_style="red",
        ))
        return None
    creds = service_account.Credentials.from_service_account_file(
        config.SERVICE_ACCOUNT_FILE, scopes=config.SCOPES
    )
    return build("searchconsole", "v1", credentials=creds)


def list_properties(service):
    response = service.sites().list().execute()
    sites = response.get("siteEntry", [])
    return [
        {"url": s["siteUrl"], "level": s.get("permissionLevel", "unknown")}
        for s in sites
    ]


def pick_property(service):
    """List all GSC properties and let the user choose one."""
    properties = list_properties(service)

    if not properties:
        console.print(Panel(
            "No properties found for this service account.\n\n"
            "Add the service account email as a user in Google Search Console:\n"
            "[dim]Settings > Users and permissions > Add user[/dim]",
            title="[bold red]No Properties[/bold red]",
            border_style="red",
        ))
        return None

    table = Table(
        box=box.ROUNDED,
        border_style="cyan",
        title="[bold]Your GSC Properties[/bold]",
        title_style="bold white",
        padding=(0, 2),
    )
    table.add_column("#", style="bold cyan", justify="right", width=4)
    table.add_column("Property URL", style="white")
    table.add_column("Permission", style="green")

    for i, prop in enumerate(properties, 1):
        table.add_row(str(i), prop["url"], prop["level"])

    console.print(table)

    if config.GSC_PROPERTY:
        matching = [p for p in properties if p["url"] == config.GSC_PROPERTY]
        if matching:
            console.print(f"\n  Auto-selected from .env: [bold cyan]{config.GSC_PROPERTY}[/bold cyan]")
            return config.GSC_PROPERTY

    console.print()
    while True:
        try:
            choice = console.input("  [bold]Pick a property (number):[/bold] ").strip()
            idx = int(choice) - 1
            if 0 <= idx < len(properties):
                selected = properties[idx]["url"]
                console.print(f"  Selected: [bold cyan]{selected}[/bold cyan]")
                return selected
            console.print("  [yellow]Invalid number, try again.[/yellow]")
        except (ValueError, KeyboardInterrupt, EOFError):
            return None


def generate_month_ranges(start_date_str, end_date_str):
    start = datetime.strptime(start_date_str, "%Y-%m-%d")
    end = datetime.strptime(end_date_str, "%Y-%m-%d")
    ranges = []

    current = start
    while current < end:
        month_end = (current.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        period_end = min(month_end, end)
        ranges.append((current.strftime("%Y-%m-%d"), period_end.strftime("%Y-%m-%d")))
        current = period_end + timedelta(days=1)

    return ranges


def fetch_gsc_data(service, property_url, start_date, end_date, dimensions=None, data_type="web", max_retries=3):
    if dimensions is None:
        dimensions = ["query", "page", "date", "country", "device"]

    all_rows = []
    start_row = 0

    while True:
        request_body = {
            "startDate": start_date,
            "endDate": end_date,
            "dimensions": dimensions,
            "rowLimit": config.GSC_ROW_LIMIT,
            "startRow": start_row,
            "type": data_type,
        }

        rows = None
        for attempt in range(max_retries):
            try:
                response = service.searchanalytics().query(
                    siteUrl=property_url, body=request_body
                ).execute()
                rows = response.get("rows", [])
                break
            except Exception as e:
                if attempt < max_retries - 1:
                    wait = (attempt + 1) * 5
                    console.print(f"  [yellow]Retry {attempt + 1}/{max_retries} after {type(e).__name__}. Waiting {wait}s...[/yellow]")
                    time.sleep(wait)
                else:
                    console.print(f"  [red]Failed after {max_retries} retries: {e}[/red]")
                    return all_rows

        if not rows:
            break

        all_rows.extend(rows)
        start_row += len(rows)

        if len(rows) < config.GSC_ROW_LIMIT:
            break

        time.sleep(0.3)

    return all_rows


def _save_partial(all_data, property_url, start_date, end_date):
    """Save current data to disk after each month (crash recovery)."""
    output_file = os.path.join(config.RAW_DATA_DIR, "gsc_raw_data.json")
    with open(output_file, "w") as f:
        json.dump({
            "property": property_url,
            "start_date": start_date,
            "end_date": end_date,
            "extracted_at": datetime.now().isoformat(),
            "total_rows": len(all_data),
            "rows": all_data,
        }, f)


def _extract_top_pages_previous_year(service, property_url):
    """Fetch top 50 pages by clicks from the previous year (page-level only, fast)."""
    start_date, end_date = config.get_previous_year_range()

    console.print(f"  [dim]Fetching top 50 pages from {start_date} to {end_date}...[/dim]")

    rows = fetch_gsc_data(
        service, property_url, start_date, end_date,
        dimensions=["page"],
    )

    # Sort by clicks descending and keep top 50
    rows.sort(key=lambda r: r.get("clicks", 0), reverse=True)
    top_50 = rows[:50]

    console.print(f"  [green]✓[/green] {len(rows):,} pages fetched, kept top 50")
    return top_50, start_date, end_date


def extract_all_data():
    service = authenticate()
    if service is None:
        return None

    property_url = pick_property(service)
    if not property_url:
        return None

    # Phase 1: Last 3 months (detailed: query + page + date + country + device)
    start_date, end_date = config.get_date_range(months=3)
    month_ranges = generate_month_ranges(start_date, end_date)

    console.print()
    info = Table.grid(padding=(0, 2))
    info.add_column(style="bold white", no_wrap=True)
    info.add_column(style="cyan")
    info.add_row("Property:", property_url)
    info.add_row("Recent range:", f"{start_date}  to  {end_date}  (3 months)")
    info.add_row("+ Top 50:", f"Best pages from {datetime.now().year - 1}")
    console.print(Panel(info, title="[bold]Extraction Config[/bold]", border_style="blue", padding=(1, 3)))
    console.print()

    Path(config.RAW_DATA_DIR).mkdir(exist_ok=True)
    all_data = []

    with Progress(
        SpinnerColumn("dots"),
        TextColumn("[bold blue]{task.description}"),
        BarColumn(bar_width=40, style="cyan", complete_style="bold green"),
        TaskProgressColumn(),
        TextColumn("[dim]|[/dim]"),
        TimeElapsedColumn(),
        console=console,
        transient=False,
    ) as progress:
        task = progress.add_task("Fetching", total=len(month_ranges))

        for month_start, month_end in month_ranges:
            progress.update(task, description=f"Fetching  {month_start} → {month_end}")
            rows = fetch_gsc_data(service, property_url, month_start, month_end)
            all_data.extend(rows)
            _save_partial(all_data, property_url, start_date, end_date)
            progress.advance(task)
            time.sleep(0.5)

    # Phase 2: Top 50 pages from previous year
    console.print()
    top_pages, yr_start, yr_end = _extract_top_pages_previous_year(service, property_url)

    output_file = os.path.join(config.RAW_DATA_DIR, "gsc_raw_data.json")
    with open(output_file, "w") as f:
        json.dump(
            {
                "property": property_url,
                "start_date": start_date,
                "end_date": end_date,
                "extracted_at": datetime.now().isoformat(),
                "total_rows": len(all_data),
                "rows": all_data,
                "top_pages_previous_year": {
                    "year": datetime.now().year - 1,
                    "start_date": yr_start,
                    "end_date": yr_end,
                    "count": len(top_pages),
                    "pages": top_pages,
                },
            },
            f,
        )

    console.print()
    console.print(Panel(
        f"[bold green]{len(all_data):,}[/bold green] rows (3 months) + [bold green]{len(top_pages)}[/bold green] top pages ({datetime.now().year - 1})\n"
        f"Saved to [cyan]{output_file}[/cyan]",
        title="[bold green]Extraction Complete[/bold green]",
        border_style="green",
        padding=(1, 3),
    ))
    return output_file


def extract_discover_data(property_url=None):
    """Extract Google Discover data (page-centric, no query dimension)."""
    service = authenticate()
    if service is None:
        return None

    if not property_url:
        property_url = pick_property(service)
    if not property_url:
        return None

    start_date, end_date = config.get_date_range()
    month_ranges = generate_month_ranges(start_date, end_date)

    console.print()
    info = Table.grid(padding=(0, 2))
    info.add_column(style="bold white", no_wrap=True)
    info.add_column(style="cyan")
    info.add_row("Property:", property_url)
    info.add_row("Type:", "Google Discover")
    info.add_row("Date range:", f"{start_date}  to  {end_date}")
    info.add_row("Months:", str(len(month_ranges)))
    info.add_row("Dimensions:", "page, date, device, country")
    console.print(Panel(info, title="[bold]Discover Extraction[/bold]", border_style="magenta", padding=(1, 3)))
    console.print()

    Path(config.RAW_DATA_DIR).mkdir(exist_ok=True)
    all_data = []

    with Progress(
        SpinnerColumn("dots"),
        TextColumn("[bold magenta]{task.description}"),
        BarColumn(bar_width=40, style="magenta", complete_style="bold green"),
        TaskProgressColumn(),
        TextColumn("[dim]|[/dim]"),
        TimeElapsedColumn(),
        console=console,
        transient=False,
    ) as progress:
        task = progress.add_task("Fetching Discover", total=len(month_ranges))

        for month_start, month_end in month_ranges:
            progress.update(task, description=f"Discover  {month_start} → {month_end}")
            rows = fetch_gsc_data(
                service, property_url, month_start, month_end,
                dimensions=["page", "date", "device", "country"],
                data_type="discover",
            )
            all_data.extend(rows)
            progress.advance(task)
            time.sleep(0.5)

    output_file = os.path.join(config.RAW_DATA_DIR, "gsc_discover_data.json")
    with open(output_file, "w") as f:
        json.dump(
            {
                "property": property_url,
                "type": "discover",
                "start_date": start_date,
                "end_date": end_date,
                "extracted_at": datetime.now().isoformat(),
                "total_rows": len(all_data),
                "rows": all_data,
            },
            f,
            indent=2,
        )

    console.print()
    console.print(Panel(
        f"[bold green]{len(all_data):,}[/bold green] Discover rows extracted\n"
        f"Saved to [cyan]{output_file}[/cyan]",
        title="[bold green]Discover Extraction Complete[/bold green]",
        border_style="green",
        padding=(1, 3),
    ))
    return output_file
