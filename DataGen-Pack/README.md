This is a setup for generating paired training dataset for image-to-image models based on Blender fluid simulations.
The pairs will contain:
A) rendering of a velocity encoded low-resolution fluid simulation
B) lit and shaded rendering of a high-resolution fluid simulation
C) Normal
D) Depth map

When first executing the script it will download the required version of blender before starting to generate images.

To start the generation process run:
`python ./generate_data.py --index 0`

If you want to continue the generation process for an existing dataset, set index to your desired starting index for image naming:
`python ./generate_data.py --index [start_index]`
