"""
Export vectordb-gsc analyses as static JSON files for the ClawdBot dashboard.
Usage: python main.py export --output /path/to/clawdbot-dashboard/ai_data/
"""

import json
import os
import time
from datetime import datetime

from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, TimeElapsedColumn

import config
import vector_store
import ai_analyzer

console = Console()

SEARCH_KEYS = ["overview", "opportunities", "declining", "content_gaps", "cannibalization"]
DISCOVER_KEYS = ["discover_overview", "discover_winners", "discover_declining"]


def export_to_dashboard(output_dir, provider="gemini"):
    """Run all preset analyses (Search + Discover) and write JSON files."""

    os.makedirs(output_dir, exist_ok=True)

    total_analyses = len(SEARCH_KEYS) + len(DISCOVER_KEYS)
    console.print(Panel(
        f"  Output:   [bold cyan]{output_dir}[/bold cyan]\n"
        f"  Provider: [bold]{provider}[/bold]\n"
        f"  Analyses: [bold]{total_analyses}[/bold] ({len(SEARCH_KEYS)} Search + {len(DISCOVER_KEYS)} Discover)",
        title="[bold]Marmiton HQ Export[/bold]",
        border_style="blue",
        padding=(1, 2),
    ))
    console.print()

    # 1. Export stats
    stats = vector_store.get_collection_stats()
    qp = stats.get(config.QUERIES_COLLECTION, 0)
    pg = stats.get(config.PAGES_COLLECTION, 0)
    disc = stats.get(config.DISCOVER_COLLECTION, 0)

    if qp == 0 and pg == 0 and disc == 0:
        console.print("  [red]Vector database is empty. Run 'python main.py process' first.[/red]")
        return False

    stats_data = {
        "total_query_pairs": qp,
        "total_pages": pg,
        "total_discover_pages": disc,
        "embedding_model": config.EMBEDDING_MODEL,
        "embedding_dimensions": config.EMBEDDING_DIMENSIONS,
        "last_extraction": datetime.now().isoformat(),
        "property": config.GSC_PROPERTY,
    }
    _write_json(os.path.join(output_dir, "stats.json"), stats_data)
    console.print("  [green]✓[/green] stats.json")

    start_time = time.time()
    results = {}

    with Progress(
        SpinnerColumn("dots"),
        TextColumn("[bold blue]{task.description}"),
        TimeElapsedColumn(),
        console=console,
        transient=False,
    ) as progress:

        # 2. Search analyses
        for key in SEARCH_KEYS:
            prompt_config = ai_analyzer.ANALYSIS_PROMPTS[key]
            task = progress.add_task(f"  🔍 {prompt_config['title']}...", total=None)
            try:
                result_md = ai_analyzer.run_analysis(key, provider=provider)
                if result_md:
                    _write_analysis(output_dir, key, prompt_config["title"], provider, result_md, "search")
                    results[key] = True
                    progress.update(task, description=f"  [green]✓[/green] {prompt_config['title']}")
                else:
                    results[key] = False
                    progress.update(task, description=f"  [red]✗[/red] {prompt_config['title']}")
            except Exception as e:
                console.print(f"  [red]Error on {key}: {e}[/red]")
                results[key] = False
            progress.stop_task(task)

        # 3. Discover analyses
        if disc > 0:
            for key in DISCOVER_KEYS:
                prompt_config = ai_analyzer.DISCOVER_PROMPTS[key]
                task = progress.add_task(f"  ✨ {prompt_config['title']}...", total=None)
                try:
                    result_md = ai_analyzer.run_discover_analysis(key, provider=provider)
                    if result_md:
                        _write_analysis(output_dir, key, prompt_config["title"], provider, result_md, "discover")
                        results[key] = True
                        progress.update(task, description=f"  [green]✓[/green] {prompt_config['title']}")
                    else:
                        results[key] = False
                        progress.update(task, description=f"  [red]✗[/red] {prompt_config['title']}")
                except Exception as e:
                    console.print(f"  [red]Error on {key}: {e}[/red]")
                    results[key] = False
                progress.stop_task(task)
        else:
            console.print("  [yellow]⚠ No Discover data — skipping Discover analyses[/yellow]")

    # 4. Write meta
    duration = time.time() - start_time
    succeeded = sum(1 for v in results.values() if v)
    meta = {
        "generated_at": datetime.now().isoformat(),
        "provider": provider,
        "duration_seconds": round(duration),
        "analyses_count": succeeded,
        "search_analyses": sum(1 for k in SEARCH_KEYS if results.get(k)),
        "discover_analyses": sum(1 for k in DISCOVER_KEYS if results.get(k)),
        "version": "2.0",
    }
    _write_json(os.path.join(output_dir, "meta.json"), meta)

    console.print()
    console.print(Panel(
        f"  [bold green]{succeeded}/{total_analyses}[/bold green] analyses exported in {round(duration)}s\n"
        f"  Output: [cyan]{output_dir}[/cyan]",
        title="[bold]Marmiton HQ Export Complete[/bold]",
        border_style="green",
        padding=(1, 2),
    ))

    return succeeded > 0


def _write_analysis(output_dir, key, title, provider, result_md, source):
    """Write a single analysis JSON file."""
    analysis_data = {
        "title": title,
        "key": key,
        "source": source,
        "provider": provider,
        "generated_at": datetime.now().isoformat(),
        "content_md": result_md,
        "summary": _extract_summary(result_md),
        "key_metrics": _extract_metrics(key),
    }
    _write_json(os.path.join(output_dir, f"{key}.json"), analysis_data)


def _extract_summary(markdown_text):
    """Extract first meaningful paragraph as summary."""
    lines = markdown_text.strip().split("\n")
    for line in lines:
        line = line.strip()
        if line and not line.startswith("#") and not line.startswith("|") and not line.startswith("-") and len(line) > 30:
            return line[:200]
    return "Analyse disponible — cliquez pour voir les détails."


def _extract_metrics(key):
    """Generate key metrics badges based on analysis type."""
    metric_configs = {
        "overview": [{"label": "Analyse", "value": "Search", "color": "blue"}],
        "opportunities": [{"label": "Type", "value": "Opportunités", "color": "green"}],
        "declining": [{"label": "Type", "value": "Déclin", "color": "red"}],
        "content_gaps": [{"label": "Type", "value": "Gaps", "color": "purple"}],
        "cannibalization": [{"label": "Type", "value": "Cannibalisation", "color": "yellow"}],
        "discover_overview": [{"label": "Analyse", "value": "Discover", "color": "purple"}],
        "discover_winners": [{"label": "Type", "value": "Winners", "color": "green"}],
        "discover_declining": [{"label": "Type", "value": "Déclin Discover", "color": "red"}],
    }
    return metric_configs.get(key, [])


def _write_json(filepath, data):
    """Write data as formatted JSON."""
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
