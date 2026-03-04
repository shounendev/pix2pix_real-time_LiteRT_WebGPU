import subprocess
from random import random
import sys
import os
import download_bleder
import argparse

blender_path = "./blender-4.5.7-linux-x64/blender"
ouput_dir = "./training_data/"

blend_low = "./WaterSim_low.blend"
blend_high = "./WaterSim_high_v2.blend"


def random_position():
    return 4 * (random() - 0.5)


def generate():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--index",
        required=True,
        help="The start index for the ouput image naming. Set to 0 if you are generating a fresh set.",
    )

    args = parser.parse_args()

    download_bleder.download_and_extract()

    i = int(args.index)

    os.makedirs("./output/test/A/", exist_ok=True)
    os.makedirs("./output/train/A/", exist_ok=True)
    os.makedirs("./output/val/A/", exist_ok=True)
    os.makedirs("./output/test/B/", exist_ok=True)
    os.makedirs("./output/train/B/", exist_ok=True)
    os.makedirs("./output/val/B/", exist_ok=True)
    os.makedirs("./output/test/C/", exist_ok=True)
    os.makedirs("./output/train/C/", exist_ok=True)
    os.makedirs("./output/val/C/", exist_ok=True)
    os.makedirs("./output/test/D/", exist_ok=True)
    os.makedirs("./output/train/D/", exist_ok=True)
    os.makedirs("./output/val/D/", exist_ok=True)

    while True:
        x1 = random_position()
        y1 = random_position()
        x2 = random_position()
        y2 = random_position()

        file = blend_low
        print(f"Generating low {i} with positions: ({x1}, {y1}), ({x2}, {y2})")
        cmd = [
            f"{blender_path}",
            "-b",
            f"{file}",
            "-P",
            "MoveObstacles.py",
            "-f",
            "140",
            "--",
            f"{x1}",
            f"{y1}",
            f"{x2}",
            f"{y2}",
        ]
        subprocess.run(cmd)
        cmd = [
            f"{blender_path}",
            "-b",
            f"{file}",
            "-f",
            "100",
        ]
        subprocess.run(cmd)
        cmd = [
            f"{blender_path}",
            "-b",
            f"{file}",
            "-f",
            "50",
        ]
        subprocess.run(cmd)

        file = blend_high
        print(f"Generating high {i} with positions: ({x1}, {y1}), ({x2}, {y2})")
        cmd = [
            f"{blender_path}",
            "-b",
            f"{file}",
            "-P",
            "MoveObstacles.py",
            "-f",
            "300",
            "--",
            f"{x1}",
            f"{y1}",
            f"{x2}",
            f"{y2}",
        ]
        subprocess.run(cmd)
        cmd = [
            f"{blender_path}",
            "-b",
            f"{file}",
            "-f",
            "250",
        ]
        subprocess.run(cmd)
        cmd = [
            f"{blender_path}",
            "-b",
            f"{file}",
            "-f",
            "100",
        ]
        subprocess.run(cmd)

        match i / 3 % 8:
            case 0:
                subset = "test"
            case 1:
                subset = "val"
            case _:
                subset = "train"

        os.rename(
            f"./output/temp/A/Image0050.png",
            f"./output/{subset}/A/{str(i).zfill(4)}.png",
        )
        os.rename(
            f"./output/temp/A/Image0100.png",
            f"./output/{subset}/A/{str(i + 1).zfill(4)}.png",
        )
        os.rename(
            f"./output/temp/A/Image0140.png",
            f"./output/{subset}/A/{str(i + 2).zfill(4)}.png",
        )

        os.rename(
            f"./output/temp/B/Image0100.png",
            f"./output/{subset}/B/{str(i).zfill(4)}.png",
        )
        os.rename(
            f"./output/temp/B/Image0250.png",
            f"./output/{subset}/B/{str(i + 1).zfill(4)}.png",
        )
        os.rename(
            f"./output/temp/B/Image0300.png",
            f"./output/{subset}/B/{str(i + 2).zfill(4)}.png",
        )

        os.rename(
            f"./output/temp/C/Image0100.png",
            f"./output/{subset}/C/{str(i).zfill(4)}.png",
        )
        os.rename(
            f"./output/temp/C/Image0250.png",
            f"./output/{subset}/C/{str(i + 1).zfill(4)}.png",
        )
        os.rename(
            f"./output/temp/C/Image0300.png",
            f"./output/{subset}/C/{str(i + 2).zfill(4)}.png",
        )

        os.rename(
            f"./output/temp/D/Image0100.png",
            f"./output/{subset}/D/{str(i).zfill(4)}.png",
        )
        os.rename(
            f"./output/temp/D/Image0250.png",
            f"./output/{subset}/D/{str(i + 1).zfill(4)}.png",
        )
        os.rename(
            f"./output/temp/D/Image0300.png",
            f"./output/{subset}/D/{str(i + 2).zfill(4)}.png",
        )

        i += 3


if __name__ == "__main__":
    generate()
