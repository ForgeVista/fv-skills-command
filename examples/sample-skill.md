---
name: data-analysis
description: "Analyze datasets using pandas and generate summary reports"
type: skill
category: analytics
tags: [pandas, reporting, data]
status: stable
version: "1.0"
related: ["py-pandas", "py-seaborn"]
scripts: ["scripts/run-analysis.sh"]
moc: false
steps:
  - name: "Step 1: Load data"
    dof:
      - "CSV file input"
      - "Database query"
      - "API fetch"
  - name: "Step 2: Transform"
    dof:
      - "Pivot table"
      - "Group-by aggregation"
  - name: "Step 3: Output"
    dof:
      - "Excel report"
      - "PDF summary"
      - "Dashboard chart"
---

# Data Analysis

Analyze datasets using [[py-pandas]] for transformation and [[py-seaborn]] for visualization.

## Usage

```bash
invoke data-analysis --input data.csv --output report.xlsx
```

## Pipeline

1. Load the dataset from the specified source
2. Apply transformations (cleaning, aggregation)
3. Generate output in the requested format

See also: [[py-excel]] for Excel-specific formatting.
