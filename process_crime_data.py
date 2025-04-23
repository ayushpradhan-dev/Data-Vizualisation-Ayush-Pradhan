import pandas as pd
import os
import glob # To find files matching a pattern

# --- Configuration ---
DATA_DIRECTORY = './' # Directory containing data files
EXCEL_FILE_NAME = 'M1045_MonthlyCrimeDashboard_TNOCrimeData.xlsx'
CSV_FILE_PATTERN = 'MPS_BoroughSNT_TNOCrimeDatafy*.csv' # Pattern to match CSV files
OUTPUT_FILE_NAME = 'london_crime_combined_clean.csv'

# --- Columns to Keep  ---
# Select columns common to both schemas that are relevant,
# standardizing names to lowercase with underscores
COLUMNS_TO_KEEP = {
    # Original Name (Excel/CSV variations) : Standardized Name
    'Month_Year': 'month_year',
    'Area Type': 'area_type',
    'Borough_SNT': 'borough_snt',
    'Area name': 'area_name',
    'Area Name': 'area_name', # Handle potential capitalization diff
    'Offence Group': 'offence_group',
    'Offence Subgroup': 'offence_subgroup',
    'Measure': 'measure',
    'Financial Year': 'financial_year',
    'Count': 'count'
}

# --- Geographic Name Standardization Mappings ---
NAME_MAPPINGS = {
    # Incorrect/Inconsistent : Correct/Standardized
    'aviation security(so18)': 'aviation security',
    'other / nk': 'aviation security', # Assuming this means Aviation Security in Excel context
    'heathrow': 'aviation security', # Example: Sometimes Heathrow might be listed separately
    'city of westminster': 'westminster', # Example if City is sometimes included/excluded
    'hammersmith & fulham': 'hammersmith and fulham', # Standardize ampersand
}

# --- Function to clean and standardize a single DataFrame ---
def clean_dataframe(df, is_excel=False):
    """Applies cleaning steps to a DataFrame."""
    print(f"Processing {'Excel' if is_excel else 'CSV'} file...")

    # 1. Rename columns to standardized names and select only those needed
    # Handle potential variations in original naming
    rename_dict = {}
    current_cols_lower = {col.lower(): col for col in df.columns}

    for original_name, std_name in COLUMNS_TO_KEEP.items():
        # Check if original name exists (case-insensitive)
        original_lower = original_name.lower()
        if original_lower in current_cols_lower:
            rename_dict[current_cols_lower[original_lower]] = std_name
        # Specific check for 'Area Name' vs 'Area name'
        elif original_name == 'Area Name' and 'area name' in current_cols_lower:
             rename_dict[current_cols_lower['area name']] = std_name
        elif original_name == 'Area name' and 'area name' in current_cols_lower:
             rename_dict[current_cols_lower['area name']] = std_name

    # Keep only the columns that were successfully found and renamed
    df = df[list(rename_dict.keys())].rename(columns=rename_dict)

    # 2. Convert 'month_year' to datetime objects
    # Assuming format like 01/04/2017 or similar date format Excel/CSV uses
    try:
        df['month_year'] = pd.to_datetime(df['month_year'], errors='coerce')
        # Keep only date part if time is included
        df['month_year'] = df['month_year'].dt.date
    except Exception as e:
        print(f"Warning: Could not parse dates effectively. Error: {e}. Check date format.")
        # Attempt common formats if first fails
        try:
             df['month_year'] = pd.to_datetime(df['month_year'], format='%d/%m/%Y', errors='coerce').dt.date
        except:
             try:
                 df['month_year'] = pd.to_datetime(df['month_year'], format='%Y-%m-%d', errors='coerce').dt.date
             except:
                 print("Error: Unrecognized date format in 'month_year'. Please inspect data.")
                 # Handle error - drop rows with bad dates or stop execution
                 df = df.dropna(subset=['month_year'])


    # 3. Convert 'count' to numeric, coercing errors to NaN (which can be handled later)
    df['count'] = pd.to_numeric(df['count'], errors='coerce')

    # 4. Clean string columns: lowercase and strip whitespace
    string_cols = ['area_type', 'borough_snt', 'area_name', 'offence_group', 'offence_subgroup', 'measure']
    for col in string_cols:
        if col in df.columns:
            df[col] = df[col].str.lower().str.strip()

    # 5. Standardize 'measure' column
    if 'measure' in df.columns:
        df['measure'] = df['measure'].replace({'outcomes': 'positive outcomes'})
        # Add checks for unexpected values
        expected_measures = ['offences', 'positive outcomes']
        unexpected = df[~df['measure'].isin(expected_measures)]['measure'].unique()
        if len(unexpected) > 0:
            print(f"Warning: Unexpected values found in 'measure' column: {unexpected}")


    # 6. Standardize Geographic Names (using the NAME_MAPPINGS dict)
    if 'area_name' in df.columns:
        # Standardize '&' to 'and' first
        df['area_name'] = df['area_name'].str.replace(' & ', ' and ', regex=False)
        # Apply specific mappings
        df['area_name'] = df['area_name'].replace(NAME_MAPPINGS)

    if 'borough_snt' in df.columns:
        # Standardize '&' to 'and' first
        df['borough_snt'] = df['borough_snt'].str.replace(' & ', ' and ', regex=False)
        # Apply specific mappings (might need more specific mappings for SNT level)
        df['borough_snt'] = df['borough_snt'].replace(NAME_MAPPINGS) # Use same map for now


    # Handle NaNs created during conversion/cleaning 
    # df['count'] = df['count'].fillna(0)
    df = df.dropna(subset=['month_year', 'count']) # Drop rows where date/count conversion failed

    return df

# --- Main Script Logic ---

# 1. Load Excel File
excel_file_path = os.path.join(DATA_DIRECTORY, EXCEL_FILE_NAME)
try:
    df_excel = pd.read_excel(excel_file_path)
    # Define the period covered by the Excel file (for filtering CSVs later)
    excel_start_date = pd.Timestamp('2021-02-01').date() # Corrected start date
    excel_end_date = pd.Timestamp('2025-01-31').date()   # Approximate end date
    print(f"Excel file loaded successfully. Covers approx: {excel_start_date} to {excel_end_date}")
    # Clean the Excel DataFrame
    df_excel_clean = clean_dataframe(df_excel.copy(), is_excel=True) # Use copy to avoid modifying original
except FileNotFoundError:
    print(f"Error: Excel file not found at {excel_file_path}")
    exit()
except Exception as e:
    print(f"Error loading Excel file: {e}")
    exit()


# 2. Load CSV Files
csv_files = glob.glob(os.path.join(DATA_DIRECTORY, CSV_FILE_PATTERN))
if not csv_files:
    print(f"Error: No CSV files found matching pattern {CSV_FILE_PATTERN} in {DATA_DIRECTORY}")
    exit()

print(f"Found {len(csv_files)} CSV files to process.")
all_csv_dfs = []
for f in csv_files:
    try:
        df_csv = pd.read_csv(f)
        # Clean the CSV DataFrame
        df_csv_clean = clean_dataframe(df_csv.copy(), is_excel=False) # Use copy
        all_csv_dfs.append(df_csv_clean)
        print(f"Processed: {os.path.basename(f)}")
    except Exception as e:
        print(f"Error processing CSV file {f}: {e}")
        # Optionally continue to next file or exit
        # continue

# 3. Combine all CSV DataFrames
if not all_csv_dfs:
    print("Error: No CSV data loaded successfully.")
    exit()

df_csv_combined = pd.concat(all_csv_dfs, ignore_index=True)
print("CSV files concatenated.")

# 4. Filter CSV data to remove dates overlapping with the Excel file
# Keep CSV data before the Excel start date
df_csv_filtered = df_csv_combined[df_csv_combined['month_year'] < excel_start_date].copy()
print(f"Filtered CSV data to include only records before {excel_start_date}.")

# 5. Combine Filtered CSV data with Clean Excel data
df_final = pd.concat([df_csv_filtered, df_excel_clean], ignore_index=True)
print("Filtered CSV data combined with Excel data.")

# 6. Sort the final DataFrame
df_final = df_final.sort_values(by=['month_year', 'area_name', 'offence_group', 'measure'])

# 7. Final check for duplicates 
# Based on key identifiers to ensure uniqueness per month/area/offence/measure
key_cols = ['month_year', 'area_name', 'borough_snt', 'offence_group', 'offence_subgroup', 'measure']
# Check if all key cols exist before using them
key_cols = [col for col in key_cols if col in df_final.columns]
initial_rows = len(df_final)
df_final.drop_duplicates(subset=key_cols, keep='last', inplace=True) # Keep 'last' favors Excel data if any overlap remained
final_rows = len(df_final)
if initial_rows != final_rows:
     print(f"Warning: Dropped {initial_rows - final_rows} duplicate rows after final concatenation.")


# 8. Export the cleaned DataFrame to CSV
output_path = os.path.join(DATA_DIRECTORY, OUTPUT_FILE_NAME)
try:
    df_final.to_csv(output_path, index=False, date_format='%Y-%m-%d') # Use standard date format
    print(f"Successfully exported cleaned data to: {output_path}")
    print(f"Final dataset covers date range: {df_final['month_year'].min()} to {df_final['month_year'].max()}")
    print(f"Final dataset has {final_rows} rows.")

    # --- Optional: Inspect unique values post-cleaning ---
    print("\n--- Unique Values Check Post-Cleaning ---")
    print("Unique Area Names (Top 50):")
    print(df_final['area_name'].unique()[:50])
    print("\nUnique Measures:")
    print(df_final['measure'].unique())
    print("\nUnique Area Types:")
    print(df_final['area_type'].unique())
    # Add more checks as needed

except Exception as e:
    print(f"Error exporting data to CSV: {e}")