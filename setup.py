"""Setuptools compatibility entry point for Sonar."""

from pathlib import Path

from setuptools import find_packages, setup


ROOT = Path(__file__).parent


setup(
    name="sonar",
    version="0.1.0",
    description=(
        "Semiconductor yield, ET, die-defect prediction and commonality RCA model"
    ),
    long_description=(ROOT / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/goood2280/Sonar",
    package_dir={"": "src"},
    packages=find_packages(where="src"),
    python_requires=">=3.10",
    install_requires=[
        "polars>=1.0",
        "pyarrow>=15",
        "pyyaml>=6",
    ],
    extras_require={
        "model": [
            "numpy>=1.26",
            "scikit-learn>=1.4",
            "lightgbm>=4.3",
            "catboost>=1.2",
        ],
        "dev": ["pytest>=8"],
    },
    entry_points={"console_scripts": ["sonar=sonar.cli:main"]},
    include_package_data=True,
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Operating System :: OS Independent",
    ],
)
