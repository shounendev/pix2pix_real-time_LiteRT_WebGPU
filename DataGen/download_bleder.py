import os
import tarfile
import urllib.request

# URL of the Blender archive
url = "https://ftp.halifax.rwth-aachen.de/blender/release/Blender4.5/blender-4.5.7-linux-x64.tar.xz"

archive_name = url.split("/")[-1]

# This is the directory name inside the archive
blender_folder_name = "blender-4.5.7-linux-x64"


def download_file(url, filename):
    print(f"Downloading Blender {url}...")
    urllib.request.urlretrieve(url, filename)
    print(f"Download complete: {filename}")


def extract_tar_xz(archive_path, destination="."):
    print(f"Extracting {archive_path}...")
    with tarfile.open(archive_path, mode="r:xz") as tar:
        tar.extractall(path=destination)
    print("Extraction complete.")


def download_and_extract():
    # If Blender directory already exists → skip everything
    if os.path.isdir(blender_folder_name):
        print(f"{blender_folder_name} already exists. Skipping download.")
        return

    # Download archive
    download_file(url, archive_name)

    # Extract archive
    extract_tar_xz(archive_name)

    # Optional: remove archive after extraction
    os.remove(archive_name)
    print(f"Removed archive: {archive_name}")


if __name__ == "__main__":
    download_and_extract()
