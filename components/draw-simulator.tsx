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
  confederation: string
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

  const countUEFATeamsInGroup = (group: Group): number => {
    return group.teams.filter((team) => team.confederation === "UEFA").length
  }

  const countGroupsWith2UEFATeams = (groupsArray: Group[]): number => {
    return groupsArray.filter((group) => countUEFATeamsInGroup(group) === 2).length
  }

  const canPlaceTeamInGroup = (team: Team, groupIndex: number, potIndex: number, groupsArray: Group[]): boolean => {
    const group = groupsArray[groupIndex]

    // Rule 1: Mexico must be in Group A position 1
    if (team.code === "MEX" && groupIndex !== 0) {
      return false
    }
    if (groupIndex === 0 && group.teams.length === 0 && team.code !== "MEX") {
      return false
    }

    // Rule 2: Check if group already has a team from this pot
    const currentPotTeams = teamsData.pots[potIndex].teams
    const hasTeamFromSamePot = group.teams.some((t) => currentPotTeams.some((pt) => pt.code === t.code))
    if (hasTeamFromSamePot) {
      return false
    }

    // Rule 3: Check if group is full
    if (group.teams.length >= 4) {
      return false
    }

    // Rule 4: Confederation restrictions
    if (team.confederation === "UEFA") {
      const uefaTeamsInGroup = countUEFATeamsInGroup(group)
      const groupsWith2UEFA = countGroupsWith2UEFATeams(groupsArray)

      // UEFA can have max 2 teams per group, and only 4 groups can have 2 UEFA teams
      if (uefaTeamsInGroup >= 2) {
        return false
      }
      if (uefaTeamsInGroup === 1 && groupsWith2UEFA >= 4) {
        return false
      }
    } else {
      // Non-UEFA teams: cannot be in same group with team from same confederation
      const hasTeamFromSameConfederation = group.teams.some((t) => t.confederation === team.confederation)
      if (hasTeamFromSameConfederation) {
        return false
      }
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

  const placeTeamsWithBacktracking = (
    groupsArray: Group[],
    allTeams: { team: Team; potIndex: number }[],
    teamIndex = 0,
  ): Group[] | null => {
    // Base case: all teams placed successfully
    if (teamIndex >= allTeams.length) {
      return groupsArray
    }

    const { team, potIndex } = allTeams[teamIndex]

    // Try placing this team in each group
    for (let groupIndex = 0; groupIndex < 12; groupIndex++) {
      if (canPlaceTeamInGroup(team, groupIndex, potIndex, groupsArray)) {
        // Place the team
        const newGroups = groupsArray.map((g, i) =>
          i === groupIndex ? { ...g, teams: [...g.teams, team] } : { ...g, teams: [...g.teams] },
        )

        // Recursively try to place remaining teams
        const result = placeTeamsWithBacktracking(newGroups, allTeams, teamIndex + 1)

        if (result) {
          return result // Success!
        }

        // Backtrack: this placement didn't work, try next group
      }
    }

    // No valid placement found for this team
    return null
  }

  const performAutomaticDraw = async () => {
    setIsDrawing(true)
    const newGroups = initializeGroups()

    // Prepare all teams with their pot indices
    const allTeams: { team: Team; potIndex: number }[] = []

    // Mexico must be first (Group A position 1)
    const mexicoTeam = teamsData.pots[0].teams.find((t) => t.code === "MEX")
    if (mexicoTeam) {
      allTeams.push({ team: mexicoTeam, potIndex: 0 })
    }

    // Add all other teams
    for (let potIndex = 0; potIndex < teamsData.pots.length; potIndex++) {
      const pot = teamsData.pots[potIndex]
      let teamsToAdd = [...pot.teams]

      // Skip Mexico in Pot 1 as it's already added
      if (potIndex === 0) {
        teamsToAdd = teamsToAdd.filter((t) => t.code !== "MEX")
      }

      // Shuffle teams within each pot for randomness
      const shuffledTeams = shuffleArray(teamsToAdd)
      shuffledTeams.forEach((team) => {
        allTeams.push({ team, potIndex })
      })
    }

    // Use backtracking to place all teams
    const result = placeTeamsWithBacktracking(newGroups, allTeams)

    if (!result) {
      console.error("[v0] Failed to place all teams - this should not happen!")
      setIsDrawing(false)
      return
    }

    // Animate the placement
    for (let i = 0; i < allTeams.length; i++) {
      setCurrentDrawingTeam(allTeams[i].team)
      await new Promise((resolve) => setTimeout(resolve, 400))

      // Update groups progressively to show animation
      const progressGroups = initializeGroups()
      for (let j = 0; j <= i; j++) {
        const { team } = allTeams[j]
        const groupIndex = result.findIndex((g) => g.teams.some((t) => t.code === team.code))
        if (groupIndex !== -1) {
          progressGroups[groupIndex].teams.push(team)
        }
      }
      setGroups([...progressGroups])
    }

    setCurrentDrawingTeam(null)
    setIsDrawing(false)
    setAvailablePots([])
  }

  const performInstantDraw = () => {
    setIsDrawing(true)
    const newGroups = initializeGroups()

    // Prepare all teams with their pot indices
    const allTeams: { team: Team; potIndex: number }[] = []

    // Mexico must be first (Group A position 1)
    const mexicoTeam = teamsData.pots[0].teams.find((t) => t.code === "MEX")
    if (mexicoTeam) {
      allTeams.push({ team: mexicoTeam, potIndex: 0 })
    }

    // Add all other teams
    for (let potIndex = 0; potIndex < teamsData.pots.length; potIndex++) {
      const pot = teamsData.pots[potIndex]
      let teamsToAdd = [...pot.teams]

      // Skip Mexico in Pot 1 as it's already added
      if (potIndex === 0) {
        teamsToAdd = teamsToAdd.filter((t) => t.code !== "MEX")
      }

      // Shuffle teams within each pot for randomness
      const shuffledTeams = shuffleArray(teamsToAdd)
      shuffledTeams.forEach((team) => {
        allTeams.push({ team, potIndex })
      })
    }

    // Use backtracking to place all teams
    const result = placeTeamsWithBacktracking(newGroups, allTeams)

    if (!result) {
      console.error("[v0] Failed to place all teams - this should not happen!")
      setIsDrawing(false)
      return
    }

    setGroups(result)
    setIsDrawing(false)
    setAvailablePots([])
  }

  const handleTeamSelect = (team: Team, potIndex: number) => {
    setSelectedTeam({ team, potIndex })
  }

  const handleGroupSelect = (groupIndex: number) => {
    if (!selectedTeam || !canPlaceTeamInGroup(selectedTeam.team, groupIndex, selectedTeam.potIndex, groups)) {
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

  const completeDrawAutomatically = () => {
    const currentGroups = [...groups]

    // Prepare remaining teams with their pot indices
    const remainingTeams: { team: Team; potIndex: number }[] = []

    for (let potIndex = 0; potIndex < availablePots.length; potIndex++) {
      const pot = availablePots[potIndex]
      const shuffledTeams = shuffleArray([...pot.teams])
      shuffledTeams.forEach((team) => {
        remainingTeams.push({ team, potIndex })
      })
    }

    // Use backtracking to place remaining teams
    const result = placeTeamsWithBacktracking(currentGroups, remainingTeams)

    if (!result) {
      console.error("[v0] Failed to complete draw - try resetting and starting over")
      alert("Não foi possível completar o sorteio com as seleções já colocadas. Tente reiniciar o sorteio.")
      return
    }

    setGroups(result)
    setIsDrawing(false)
    setAvailablePots([])
    setSelectedTeam(null)
  }

  const hasDrawn = groups.length > 0 && groups[0].teams.length > 0
  const isManualMode = drawMode === "manual"
  const isAutomaticMode = drawMode === "automatic"
  const isInstantMode = drawMode === "instant"
  const shouldShowGroups = hasDrawn || (isManualMode && groups.length > 0)
  const hasRemainingTeams = availablePots.some((pot) => pot.teams.length > 0)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-6 md:py-8 mb-6 md:mb-8 shadow-sm">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex flex-col items-center gap-3 mb-4">
            <Trophy className="w-10 h-10 md:w-12 md:h-12" />
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-balance text-center">
              Copa do Mundo FIFA 2026
            </h1>
          </div>
          <p className="text-lg md:text-xl text-center opacity-90">Simulador de Sorteio</p>
        </div>
      </div>

      <div className="container mx-auto px-4 pb-8 max-w-7xl">
        {!drawMode && (
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 md:gap-4 justify-center mb-6">
            <Button onClick={() => startDraw("automatic")} size="lg" className="gap-2 w-full sm:w-auto">
              <Shuffle className="w-5 h-5" />
              Sorteio Automático
            </Button>
            <Button
              onClick={() => startDraw("instant")}
              variant="secondary"
              size="lg"
              className="gap-2 w-full sm:w-auto"
            >
              <Zap className="w-5 h-5" />
              Sorteio Instantâneo
            </Button>
            <Button onClick={() => startDraw("manual")} variant="outline" size="lg" className="gap-2 w-full sm:w-auto">
              <Hand className="w-5 h-5" />
              Sorteio Manual
            </Button>
          </div>
        )}

        {drawMode && (
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 md:gap-4 justify-center mb-6">
            <div className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold text-center text-sm md:text-base">
              {isManualMode ? "Modo Manual" : isInstantMode ? "Modo Instantâneo" : "Modo Automático"}
            </div>
            {isManualMode && hasRemainingTeams && (
              <Button
                onClick={completeDrawAutomatically}
                variant="secondary"
                size="lg"
                className="gap-2 w-full sm:w-auto"
              >
                <Zap className="w-5 h-5" />
                Completar Automaticamente
              </Button>
            )}
            <Button onClick={resetDraw} variant="outline" size="lg" className="gap-2 bg-transparent w-full sm:w-auto">
              <RotateCcw className="w-5 h-5" />
              Reiniciar Sorteio
            </Button>
          </div>
        )}

        {/* Current Drawing Team */}
        {currentDrawingTeam && (
          <Card className="p-6 md:p-8 mb-6 md:mb-8 text-center bg-primary text-primary-foreground animate-in fade-in zoom-in duration-300">
            <p className="text-xs md:text-sm font-medium mb-2 opacity-90">Sorteando Agora</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4">
              <span className="text-4xl md:text-5xl">{currentDrawingTeam.flag}</span>
              <div>
                <h2 className="text-2xl md:text-3xl font-bold">{currentDrawingTeam.name}</h2>
                <p className="text-base md:text-lg opacity-90">{currentDrawingTeam.code}</p>
              </div>
            </div>
          </Card>
        )}

        {isManualMode && availablePots.length > 0 && (
          <Card className="p-4 md:p-6 mb-6 md:mb-8 text-center bg-accent/10 border-accent">
            <p className="text-base md:text-lg font-semibold mb-2">
              {selectedTeam
                ? `Selecionado: ${selectedTeam.team.flag} ${selectedTeam.team.name} - Agora selecione um grupo`
                : `Selecione uma seleção de ${availablePots[currentPotIndex]?.name || "um pote"}`}
            </p>
            <p className="text-xs md:text-sm text-muted-foreground">
              Regras FIFA: México no Grupo A • Seleções do mesmo pote separadas • Mesma confederação separada (UEFA: máx
              2 por grupo em 4 grupos)
            </p>
          </Card>
        )}

        {/* Pots Display (before/during manual draw) */}
        {!isAutomaticMode &&
          !isInstantMode &&
          availablePots.length > 0 &&
          availablePots.some((pot) => pot.teams.length > 0) && (
            <div className="mb-8 md:mb-12">
              <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-center">Potes do Torneio</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                {availablePots.map((pot, potIndex) => (
                  <Card
                    key={potIndex}
                    className={`p-4 md:p-6 transition-all ${
                      isManualMode && pot.teams.length > 0
                        ? "ring-2 ring-primary shadow-lg"
                        : pot.teams.length === 0
                          ? "opacity-50"
                          : ""
                    }`}
                  >
                    <h3 className="text-base md:text-lg font-bold mb-3 md:mb-4 text-center text-primary">{pot.name}</h3>
                    <div className="space-y-2">
                      {pot.teams.map((team, teamIndex) => (
                        <button
                          key={teamIndex}
                          onClick={() => isManualMode && handleTeamSelect(team, potIndex)}
                          disabled={!isManualMode || pot.teams.length === 0}
                          className={`w-full flex items-center gap-2 md:gap-3 p-2 rounded-lg transition-all ${
                            isManualMode && pot.teams.length > 0
                              ? "bg-muted/50 hover:bg-accent hover:scale-105 cursor-pointer active:scale-95"
                              : "bg-muted/50 cursor-not-allowed"
                          } ${selectedTeam?.team.code === team.code ? "ring-2 ring-primary bg-accent" : ""}`}
                        >
                          <span className="text-xl md:text-2xl">{team.flag}</span>
                          <div className="flex-1 min-w-0 text-left">
                            <p className="font-medium text-xs md:text-sm truncate">{team.name}</p>
                            <p className="text-xs text-muted-foreground">{team.code}</p>
                          </div>
                        </button>
                      ))}
                      {pot.teams.length === 0 && (
                        <div className="text-center py-4 text-muted-foreground text-xs md:text-sm">
                          Todas as seleções sorteadas
                        </div>
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
            <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-center">
              {isManualMode ? "Sorteio em Andamento" : "Resultado do Sorteio"}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
              {groups.map((group, groupIndex) => {
                const canPlace =
                  selectedTeam && canPlaceTeamInGroup(selectedTeam.team, groupIndex, selectedTeam.potIndex, groups)

                return (
                  <Card
                    key={groupIndex}
                    onClick={() => isManualMode && selectedTeam && handleGroupSelect(groupIndex)}
                    className={`p-4 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 transition-all ${
                      isManualMode && selectedTeam
                        ? canPlace
                          ? "cursor-pointer hover:ring-2 hover:ring-primary hover:shadow-lg active:scale-95"
                          : "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                    style={{ animationDelay: `${groupIndex * 50}ms` }}
                  >
                    <div className="text-center mb-3 md:mb-4">
                      <div className="inline-flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary text-primary-foreground font-bold text-lg md:text-xl mb-2">
                        {group.name}
                      </div>
                      <h3 className="text-base md:text-lg font-bold">Grupo {group.name}</h3>
                    </div>
                    <div className="space-y-2 md:space-y-3">
                      {group.teams.map((team, teamIndex) => (
                        <div
                          key={teamIndex}
                          className="flex items-center gap-2 md:gap-3 p-2 md:p-3 rounded-lg bg-card border border-border hover:bg-accent/50 transition-colors"
                        >
                          <span className="text-2xl md:text-3xl">{team.flag}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm md:text-base truncate">{team.name}</p>
                            <p className="text-xs md:text-sm text-muted-foreground">{team.code}</p>
                          </div>
                        </div>
                      ))}
                      {group.teams.length === 0 && !isManualMode && (
                        <div className="text-center py-6 md:py-8 text-muted-foreground text-xs md:text-sm">
                          Aguardando sorteio...
                        </div>
                      )}
                      {isManualMode &&
                        Array.from({ length: 4 - group.teams.length }).map((_, i) => (
                          <div
                            key={`empty-${i}`}
                            className="p-2 md:p-3 rounded-lg border-2 border-dashed border-muted-foreground/20 text-center text-muted-foreground text-xs md:text-sm"
                          >
                            Vaga disponível
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
        <div className="mt-8 md:mt-12 text-center text-xs md:text-sm text-muted-foreground">
          <p>48 seleções • 12 grupos • 4 seleções por grupo</p>
          <p className="mt-2">
            Edite <code className="px-2 py-1 bg-muted rounded text-xs">data/teams.json</code> para personalizar as
            seleções
          </p>
        </div>
      </div>
    </div>
  )
}
