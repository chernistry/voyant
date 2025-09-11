class CustomSequencer {
  sort(tests) {
    // Sort tests by filename to ensure they run in order: 01, 02, 03, etc.
    const sorted = tests.sort((a, b) => {
      const aFile = a.path.split('/').pop();
      const bFile = b.path.split('/').pop();

      // Extract numeric prefix from filenames like "01-weather_packing.test.ts"
      const aMatch = aFile.match(/^(\d+)-/);
      const bMatch = bFile.match(/^(\d+)-/);

      if (aMatch && bMatch) {
        const aNum = parseInt(aMatch[1], 10);
        const bNum = parseInt(bMatch[1], 10);
        return aNum - bNum;
      }

      // Fallback to default string sorting if no numeric prefix
      return aFile.localeCompare(bFile);
    });

    return sorted;
  }

  // Jest may call cacheResults in newer versions; implement no-op passthrough
  cacheResults(tests /*, results */) {
    return tests;
  }
}

module.exports = CustomSequencer;
