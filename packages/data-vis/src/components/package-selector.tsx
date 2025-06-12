"use client";

import * as React from "react";
import { Search, X, Plus } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { PackageGroup, PackageComparison } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";

interface PackageSelectorProps {
  selectedPackageGroups: PackageGroup[];
  onPackageGroupsChange: (packageGroups: PackageGroup[]) => void;
}

export function PackageSelector({
  selectedPackageGroups,
  onPackageGroupsChange,
}: PackageSelectorProps) {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");

  const { data: allComparisons } = useQuery<PackageComparison[]>({
    queryKey: ["npm-categories"],
    queryFn: async () => {
      const res = await fetch("/api/npm/categories");
      if (!res.ok) {
        console.error("Failed to fetch categories");
        return [];
      }
      return res.json();
    },
    initialData: [],
  });

  const { data: popularCosmosPackages } = useQuery<string[]>({
    queryKey: ["npm-packages"],
    queryFn: async () => {
      const res = await fetch("/api/npm/packages");
      if (!res.ok) {
        console.error("Failed to fetch packages");
        return [];
      }
      return res.json();
    },
    initialData: [],
  });

  const handlePresetSelect = (comparisonTitle: string) => {
    if (comparisonTitle === "custom") {
      onPackageGroupsChange([]);
      return;
    }
    const comparison = allComparisons.find((c) => c.title === comparisonTitle);
    if (comparison) {
      onPackageGroupsChange(comparison.packageGroups);
    }
  };

  const handleAddPackage = (packageName: string) => {
    if (!packageName.trim()) return;

    const newGroup: PackageGroup = {
      packages: [{ name: packageName.trim() }],
      color: null,
    };

    onPackageGroupsChange([...selectedPackageGroups, newGroup]);
    setSearchValue("");
    setSearchOpen(false);
  };

  const handleRemovePackageGroup = (index: number) => {
    const newGroups = selectedPackageGroups.filter((_, i) => i !== index);
    onPackageGroupsChange(newGroups);
  };

  const handleTogglePackageVisibility = (
    groupIndex: number,
    packageIndex: number
  ) => {
    const newGroups = [...selectedPackageGroups];
    const pkg = newGroups[groupIndex].packages[packageIndex];
    pkg.hidden = !pkg.hidden;
    onPackageGroupsChange(newGroups);
  };

  const filteredPackages = popularCosmosPackages.filter((pkg) =>
    pkg.toLowerCase().includes(searchValue.toLowerCase())
  );

  // Virtualizer for the "Selected Packages" list
  const selectedPackagesParentRef = React.useRef<HTMLDivElement>(null);
  const selectedPackagesVirtualizer = useVirtualizer({
    count: selectedPackageGroups.length,
    getScrollElement: () => selectedPackagesParentRef.current,
    estimateSize: () => 50, // Estimate height of a selected package item
    overscan: 5,
  });

  return (
    <Card id="package-selector">
      <CardHeader>
        <CardTitle>Package Selection</CardTitle>
        <CardDescription>
          Choose from popular Cosmos package comparisons or add custom packages
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Preset Comparisons */}
        <div>
          <label className="text-sm font-medium mb-2 block">
            Popular Comparisons
          </label>
          <Select onValueChange={handlePresetSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a comparison..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Custom Selection</SelectItem>
              {allComparisons.map((comparison) => (
                <SelectItem key={comparison.title} value={comparison.title}>
                  {comparison.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Add Custom Package */}
        <div>
          <label className="text-sm font-medium mb-2 block">Add Package</label>
          <div className="flex gap-2">
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={searchOpen}
                  className="flex-1 justify-between"
                >
                  {searchValue || "Search packages..."}
                  <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Search packages..."
                    value={searchValue}
                    onValueChange={setSearchValue}
                  />
                  <CommandList>
                    <CommandEmpty>
                      <div className="p-2">
                        <Button
                          variant="ghost"
                          className="w-full"
                          onClick={() => handleAddPackage(searchValue)}
                          disabled={!searchValue.trim()}
                        >
                          Add &quot;{searchValue}&quot;
                        </Button>
                      </div>
                    </CommandEmpty>
                    <CommandGroup>
                      {filteredPackages.map((pkg) => (
                        <CommandItem
                          key={pkg}
                          onSelect={() => handleAddPackage(pkg)}
                        >
                          {pkg}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button
              onClick={() => handleAddPackage(searchValue)}
              disabled={!searchValue.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Selected Packages */}
        {selectedPackageGroups.length > 0 && (
          <div id="selected-packages-groups">
            <label className="text-sm font-medium mb-2 block">
              Selected Packages ({selectedPackageGroups.length} groups)
            </label>
            <div
              ref={selectedPackagesParentRef}
              className="space-y-2 overflow-auto"
              style={{ maxHeight: "300px" }} // Set a max height for the virtualized list
              id="selected-packages-list"
            >
              <div
                style={{
                  height: `${selectedPackagesVirtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                }}
              >
                {selectedPackagesVirtualizer
                  .getVirtualItems()
                  .map((virtualItem) => {
                    const groupIndex = virtualItem.index;
                    const group = selectedPackageGroups[groupIndex];
                    return (
                      <div
                        key={groupIndex}
                        className="flex items-center gap-2 p-2 rounded-md mb-2"
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${virtualItem.size}px`,
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <div className="flex flex-wrap gap-1">
                            {group.packages.map((pkg, packageIndex) => (
                              <Badge
                                key={`${groupIndex}-${packageIndex}`}
                                variant={pkg.hidden ? "outline" : "default"}
                                className="cursor-pointer"
                                onClick={() =>
                                  handleTogglePackageVisibility(
                                    groupIndex,
                                    packageIndex
                                  )
                                }
                                style={{
                                  backgroundColor: pkg.hidden
                                    ? undefined
                                    : (group.color || "#000") + "20",
                                  borderColor: group.color || undefined,
                                  color: group.color || undefined,
                                }}
                              >
                                {pkg.name}
                                {pkg.hidden && " (hidden)"}
                              </Badge>
                            ))}
                          </div>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleRemovePackageGroup(groupIndex)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {selectedPackageGroups.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-2" />
            <p>No packages selected</p>
            <p className="text-sm">
              Choose a preset comparison or add custom packages
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
