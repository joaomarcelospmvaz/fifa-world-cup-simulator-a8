"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import teamsData from "@/data/teams.json"
import { Trophy, Shuffle, RotateCcw, Hand, Zap } from "lucide-react"

type Team = {
  name: string
  code: string
  flag: string
}

type Pot = {
  name: string
  teams: Team[]
}

type Group = {
  name: string
  teams: Team[]
}

type DrawMode = "automatic" | "manual" | "instant"

export default function DrawSimulator() {
  const [groups, setGroups] = useState<Group[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentDrawingTeam, setCurrentDrawingTeam] = useState<Team | null>(null)
  const [availablePots, setAvailablePots] = useState<Pot[]>(teamsData.pots)
  const [drawMode, setDrawMode] = useState<DrawMode | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<{ team: Team; potIndex: number } | null>(null)
  const [currentPotIndex, setCurrentPotIndex] = useState(0)

  const initializeGroups = () => {
    return Array.from({ length: 12 }, (_, i) => ({
      name: String.fromCharCode(65 + i), // A, B, C, etc.
      teams: [],
    }))
  }

  const shuffleArray = <T,>(array: T[]): T[] => {
    const newArray = [...array]
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[newArray[i], newArray[j]] = [newArray[j], newArray[i]]
    }
    return newArray
  }

  const canPlaceTeamInGroup = (team: Team, groupIndex: number, potIndex: number): boolean => {
    const group = groups[groupIndex]

    // Check if group already has a team from this pot
    const currentPotTeams = teamsData.pots[potIndex].teams
    const hasTeamFromSamePot = group.teams.some((t) => currentPotTeams.some((pt) => pt.code === t.code))

    if (hasTeamFromSamePot) {
      return false
    }

    // Check if group is full
    if (group.teams.length >= 4) {
      return false
    }

    return true
  }

  const startDraw = (mode: DrawMode) => {
    setDrawMode(mode)
    const newGroups = initializeGroups()
    setGroups(newGroups)
    setCurrentPotIndex(0)
    setAvailablePots(teamsData.pots)

    if (mode === "automatic") {
      performAutomaticDraw()
    } else if (mode === "instant") {
      performInstantDraw()
    } else if (mode === "manual") {
      setIsDrawing(true)
    }
  }

  const performAutomaticDraw = async () => {
    setIsDrawing(true)
    const newGroups = initializeGroups()
    const pots = teamsData.pots.map((pot) => ({
      ...pot,
      teams: shuffleArray([...pot.teams]),
    }))

    // Draw teams from each pot
    for (let potIndex = 0; potIndex < pots.length; potIndex++) {
      const pot = pots[potIndex]
      const shuffledGroups = shuffleArray([...Array(12).keys()])

      for (let i = 0; i < pot.teams.length; i++) {
        const team = pot.teams[i]
        const groupIndex = shuffledGroups[i]

        setCurrentDrawingTeam(team)
        await new Promise((resolve) => setTimeout(resolve, 400))

        newGroups[groupIndex].teams.push(team)
        setGroups([...newGroups])
      }
    }

    setCurrentDrawingTeam(null)
    setIsDrawing(false)
    setAvailablePots([])
  }

  const performInstantDraw = () => {
    setIsDrawing(true)
    const newGroups = initializeGroups()
    const pots = teamsData.pots.map((pot) => ({
      ...pot,
      teams: shuffleArray([...pot.teams]),
    }))

    // Draw teams from each pot instantly
    for (let potIndex = 0; potIndex < pots.length; potIndex++) {
      const pot = pots[potIndex]
      const shuffledGroups = shuffleArray([...Array(12).keys()])

      for (let i = 0; i < pot.teams.length; i++) {
        const team = pot.teams[i]
        const groupIndex = shuffledGroups[i]
        newGroups[groupIndex].teams.push(team)
      }
    }

    setGroups([...newGroups])
    setIsDrawing(false)
    setAvailablePots([])
  }

  const handleTeamSelect = (team: Team, potIndex: number) => {
    if (potIndex !== currentPotIndex) return
    setSelectedTeam({ team, potIndex })
  }

  const handleGroupSelect = (groupIndex: number) => {
    if (!selectedTeam || !canPlaceTeamInGroup(selectedTeam.team, groupIndex, selectedTeam.potIndex)) {
      return
    }

    const newGroups = [...groups]
    newGroups[groupIndex].teams.push(selectedTeam.team)
    setGroups(newGroups)

    // Remove team from available pots
    const newPots = [...availablePots]
    newPots[selectedTeam.potIndex].teams = newPots[selectedTeam.potIndex].teams.filter(
      (t) => t.code !== selectedTeam.team.code,
    )
    setAvailablePots(newPots)

    setSelectedTeam(null)

    // Check if current pot is empty, move to next pot
    if (newPots[currentPotIndex].teams.length === 0 && currentPotIndex < 3) {
      setCurrentPotIndex(currentPotIndex + 1)
    }

    // Check if draw is complete
    const allPotsEmpty = newPots.every((pot) => pot.teams.length === 0)
    if (allPotsEmpty) {
      setIsDrawing(false)
    }
  }

  const resetDraw = () => {
    setGroups([])
    setCurrentDrawingTeam(null)
    setAvailablePots(teamsData.pots)
    setDrawMode(null)
    setSelectedTeam(null)
    setCurrentPotIndex(0)
    setIsDrawing(false)
  }

  const hasDrawn = groups.length > 0 && groups[0].teams.length > 0
  const isManualMode = drawMode === "manual"
  const isAutomaticMode = drawMode === "automatic"
  const isInstantMode = drawMode === "instant"
  const shouldShowGroups = hasDrawn || (isManualMode && groups.length > 0)

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Trophy className="w-12 h-12 text-accent" />
          <h1 className="text-4xl md:text-5xl font-bold text-balance">FIFA World Cup 2026</h1>
        </div>
        <p className="text-xl text-muted-foreground mb-6">Draw Simulator</p>

        {!drawMode && (
          <div className="flex flex-wrap gap-4 justify-center">
            <Button onClick={() => startDraw("automatic")} size="lg" className="gap-2">
              <Shuffle className="w-5 h-5" />
              Automatic Draw
            </Button>
            <Button onClick={() => startDraw("instant")} variant="secondary" size="lg" className="gap-2">
              <Zap className="w-5 h-5" />
              Instant Draw
            </Button>
            <Button onClick={() => startDraw("manual")} variant="outline" size="lg" className="gap-2">
              <Hand className="w-5 h-5" />
              Manual Draw
            </Button>
          </div>
        )}

        {drawMode && (
          <div className="flex flex-wrap gap-4 justify-center">
            <div className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold">
              {isManualMode ? "Manual Draw Mode" : isInstantMode ? "Instant Draw Mode" : "Automatic Draw Mode"}
            </div>
            <Button onClick={resetDraw} variant="outline" size="lg" className="gap-2 bg-transparent">
              <RotateCcw className="w-5 h-5" />
              Reset Draw
            </Button>
          </div>
        )}
      </div>

      {/* Current Drawing Team */}
      {currentDrawingTeam && (
        <Card className="p-8 mb-8 text-center bg-primary text-primary-foreground animate-in fade-in zoom-in duration-300">
          <p className="text-sm font-medium mb-2 opacity-90">Now Drawing</p>
          <div className="flex items-center justify-center gap-4">
            <span className="text-5xl">{currentDrawingTeam.flag}</span>
            <div>
              <h2 className="text-3xl font-bold">{currentDrawingTeam.name}</h2>
              <p className="text-lg opacity-90">{currentDrawingTeam.code}</p>
            </div>
          </div>
        </Card>
      )}

      {isManualMode && availablePots.length > 0 && (
        <Card className="p-6 mb-8 text-center bg-accent/10 border-accent">
          <p className="text-lg font-semibold mb-2">
            {selectedTeam
              ? `Selected: ${selectedTeam.team.flag} ${selectedTeam.team.name} - Now select a group`
              : `Select a team from ${availablePots[currentPotIndex]?.name || "the current pot"}`}
          </p>
          <p className="text-sm text-muted-foreground">
            FIFA Rules: Teams from the same pot cannot be in the same group
          </p>
        </Card>
      )}

      {/* Pots Display (before/during manual draw) */}
      {!isAutomaticMode &&
        !isInstantMode &&
        availablePots.length > 0 &&
        availablePots.some((pot) => pot.teams.length > 0) && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-center">Tournament Pots</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {availablePots.map((pot, potIndex) => (
                <Card
                  key={potIndex}
                  className={`p-6 transition-all ${
                    isManualMode && potIndex === currentPotIndex
                      ? "ring-2 ring-primary shadow-lg"
                      : potIndex < currentPotIndex
                        ? "opacity-50"
                        : ""
                  }`}
                >
                  <h3 className="text-lg font-bold mb-4 text-center text-primary">
                    {pot.name}
                    {isManualMode && potIndex === currentPotIndex && (
                      <span className="ml-2 text-sm text-accent">(Active)</span>
                    )}
                  </h3>
                  <div className="space-y-2">
                    {pot.teams.map((team, teamIndex) => (
                      <button
                        key={teamIndex}
                        onClick={() => isManualMode && handleTeamSelect(team, potIndex)}
                        disabled={!isManualMode || potIndex !== currentPotIndex}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all ${
                          isManualMode && potIndex === currentPotIndex
                            ? "bg-muted/50 hover:bg-accent hover:scale-105 cursor-pointer"
                            : "bg-muted/50 cursor-not-allowed"
                        } ${selectedTeam?.team.code === team.code ? "ring-2 ring-primary bg-accent" : ""}`}
                      >
                        <span className="text-2xl">{team.flag}</span>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="font-medium text-sm truncate">{team.name}</p>
                          <p className="text-xs text-muted-foreground">{team.code}</p>
                        </div>
                      </button>
                    ))}
                    {pot.teams.length === 0 && (
                      <div className="text-center py-4 text-muted-foreground text-sm">All teams drawn</div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

      {/* Groups Display (after/during draw) */}
      {shouldShowGroups && (
        <div>
          <h2 className="text-2xl font-bold mb-6 text-center">{isManualMode ? "Draw in Progress" : "Draw Results"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {groups.map((group, groupIndex) => {
              const canPlace = selectedTeam && canPlaceTeamInGroup(selectedTeam.team, groupIndex, selectedTeam.potIndex)

              return (
                <Card
                  key={groupIndex}
                  onClick={() => isManualMode && selectedTeam && handleGroupSelect(groupIndex)}
                  className={`p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 transition-all ${
                    isManualMode && selectedTeam
                      ? canPlace
                        ? "cursor-pointer hover:ring-2 hover:ring-primary hover:shadow-lg"
                        : "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                  style={{ animationDelay: `${groupIndex * 50}ms` }}
                >
                  <div className="text-center mb-4">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-xl mb-2">
                      {group.name}
                    </div>
                    <h3 className="text-lg font-bold">Group {group.name}</h3>
                  </div>
                  <div className="space-y-3">
                    {group.teams.map((team, teamIndex) => (
                      <div
                        key={teamIndex}
                        className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:bg-accent/50 transition-colors"
                      >
                        <span className="text-3xl">{team.flag}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{team.name}</p>
                          <p className="text-sm text-muted-foreground">{team.code}</p>
                        </div>
                      </div>
                    ))}
                    {group.teams.length === 0 && !isManualMode && (
                      <div className="text-center py-8 text-muted-foreground text-sm">Awaiting draw...</div>
                    )}
                    {isManualMode &&
                      Array.from({ length: 4 - group.teams.length }).map((_, i) => (
                        <div
                          key={`empty-${i}`}
                          className="p-3 rounded-lg border-2 border-dashed border-muted-foreground/20 text-center text-muted-foreground text-sm"
                        >
                          Empty slot
                        </div>
                      ))}
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Info Footer */}
      <div className="mt-12 text-center text-sm text-muted-foreground">
        <p>48 teams • 12 groups • 4 teams per group</p>
        <p className="mt-2">
          Edit <code className="px-2 py-1 bg-muted rounded text-xs">data/teams.json</code> to customize teams
        </p>
      </div>
    </div>
  )
}
