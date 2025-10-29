"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import teamsData from "@/data/teams.json"
import { Trophy, Shuffle, RotateCcw, Hand, Zap, ChevronLeft, ChevronRight } from "lucide-react"

type Team = {
  name: string
  code: string
  flag: string
  confederation: string
  potIndex?: number // Added potIndex to track which pot the team came from
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
  const [movingFromGroup, setMovingFromGroup] = useState<number | null>(null)
  const [currentPotIndex, setCurrentPotIndex] = useState(0)
  const cancelDrawRef = useRef(false)
  const teamClickedRef = useRef(false)

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

  const canPlaceTeamInGroup = (
    team: Team,
    groupIndex: number,
    potIndex: number,
    groupsArray: Group[],
    excludeFromGroupIndex: number | null = null,
  ): boolean => {
    const group = groupsArray[groupIndex]

    // Rule 1: Mexico must be in Group A position 1
    if (team.code === "MEX" && groupIndex !== 0) {
      return false
    }
    if (groupIndex === 0 && group.teams.length === 0 && team.code !== "MEX") {
      return false
    }

    // Get all teams from the pot we're trying to place from
    const currentPotTeams = teamsData.pots[potIndex].teams

    // Check each team in the group
    for (const teamInGroup of group.teams) {
      // Skip the team being moved if it's in this group
      if (excludeFromGroupIndex === groupIndex && teamInGroup.code === team.code) {
        continue
      }

      // Check if this team in the group is from the same pot
      const isFromSamePot = currentPotTeams.some((pt) => pt.code === teamInGroup.code)
      if (isFromSamePot) {
        return false
      }
    }

    // Rule 3: Check if group is full (excluding the team being moved if it's in this group)
    const effectiveTeamCount = excludeFromGroupIndex === groupIndex ? group.teams.length - 1 : group.teams.length
    if (effectiveTeamCount >= 4) {
      return false
    }

    // Rule 4: Confederation restrictions
    if (team.confederation === "UEFA") {
      // Create a temporary groups array for UEFA counting (excluding the team being moved)
      const tempGroups = groupsArray.map((g, idx) => ({
        ...g,
        teams: excludeFromGroupIndex === idx ? g.teams.filter((t) => t.code !== team.code) : g.teams,
      }))

      const uefaTeamsInGroup = countUEFATeamsInGroup(tempGroups[groupIndex])
      const groupsWith2UEFA = countGroupsWith2UEFATeams(tempGroups)

      // UEFA can have max 2 teams per group, and only 4 groups can have 2 UEFA teams
      if (uefaTeamsInGroup >= 2) {
        return false
      }
      if (uefaTeamsInGroup === 1 && groupsWith2UEFA >= 4) {
        return false
      }
    } else {
      // Non-UEFA teams: cannot be in same group with team from same confederation (excluding the team being moved)
      const hasTeamFromSameConfederation = group.teams.some(
        (t) =>
          t.confederation === team.confederation && !(excludeFromGroupIndex === groupIndex && t.code === team.code),
      )
      if (hasTeamFromSameConfederation) {
        return false
      }
    }

    return true
  }

  const startDraw = (mode: DrawMode) => {
    cancelDrawRef.current = false
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
      allTeams.push({ team: { ...mexicoTeam, potIndex: 0 }, potIndex: 0 }) // Store potIndex in team
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
        allTeams.push({ team: { ...team, potIndex }, potIndex }) // Store potIndex in team
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
      if (cancelDrawRef.current) {
        setCurrentDrawingTeam(null)
        setIsDrawing(false)
        return
      }

      setCurrentDrawingTeam(allTeams[i].team)
      await new Promise((resolve) => setTimeout(resolve, 400))

      if (cancelDrawRef.current) {
        setCurrentDrawingTeam(null)
        setIsDrawing(false)
        return
      }

      // Update groups progressively to show animation
      const progressGroups = initializeGroups()
      for (let j = 0; j <= i; j++) {
        const { team } = allTeams[j]
        const groupIndex = result.findIndex((g) => g.teams.some((t) => t.code === team.code))
        if (groupIndex !== -1) {
          progressGroups[groupIndex].teams.push(team) // Team already has potIndex stored
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
      allTeams.push({ team: { ...mexicoTeam, potIndex: 0 }, potIndex: 0 }) // Store potIndex in team
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
        allTeams.push({ team: { ...team, potIndex }, potIndex }) // Store potIndex in team
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
    setMovingFromGroup(null)
  }

  const handlePlacedTeamClick = (team: Team, groupIndex: number, e: React.MouseEvent) => {
    e.stopPropagation()
    teamClickedRef.current = true

    setTimeout(() => {
      teamClickedRef.current = false
    }, 100)

    if (!isManualMode) {
      return
    }

    // Use the stored potIndex from the team object
    if (team.potIndex === undefined) {
      console.error("[v0] Team does not have potIndex stored:", team)
      return
    }

    setSelectedTeam({ team, potIndex: team.potIndex })
    setMovingFromGroup(groupIndex)
  }

  const handleGroupSelect = (groupIndex: number) => {
    if (teamClickedRef.current) {
      return
    }

    if (!selectedTeam) {
      return
    }

    if (movingFromGroup !== null) {
      if (movingFromGroup === groupIndex) {
        setSelectedTeam(null)
        setMovingFromGroup(null)
        return
      }

      const canPlace = canPlaceTeamInGroup(
        selectedTeam.team,
        groupIndex,
        selectedTeam.potIndex,
        groups,
        movingFromGroup,
      )

      if (!canPlace) {
        return
      }

      const newGroups = [...groups]
      newGroups[movingFromGroup].teams = newGroups[movingFromGroup].teams.filter(
        (t) => t.code !== selectedTeam.team.code,
      )
      newGroups[groupIndex].teams.push({ ...selectedTeam.team, potIndex: selectedTeam.potIndex })
      setGroups(newGroups)

      setSelectedTeam(null)
      setMovingFromGroup(null)
      return
    }

    if (!canPlaceTeamInGroup(selectedTeam.team, groupIndex, selectedTeam.potIndex, groups)) {
      return
    }

    const newGroups = [...groups]
    newGroups[groupIndex].teams.push({ ...selectedTeam.team, potIndex: selectedTeam.potIndex })
    setGroups(newGroups)

    const newPots = [...availablePots]
    newPots[selectedTeam.potIndex].teams = newPots[selectedTeam.potIndex].teams.filter(
      (t) => t.code !== selectedTeam.team.code,
    )
    setAvailablePots(newPots)

    setSelectedTeam(null)

    if (newPots[currentPotIndex].teams.length === 0 && currentPotIndex < 3) {
      setCurrentPotIndex(currentPotIndex + 1)
    }

    const allPotsEmpty = newPots.every((pot) => pot.teams.length === 0)
    if (allPotsEmpty) {
      setIsDrawing(false)
    }
  }

  const resetDraw = () => {
    cancelDrawRef.current = true
    setGroups([])
    setCurrentDrawingTeam(null)
    setAvailablePots(teamsData.pots)
    setDrawMode(null)
    setSelectedTeam(null)
    setMovingFromGroup(null)
    setCurrentPotIndex(0)
    setIsDrawing(false)
  }

  const completeDrawAutomatically = () => {
    const currentGroups = [...groups]

    const remainingTeams: { team: Team; potIndex: number }[] = []

    for (let potIndex = 0; potIndex < availablePots.length; potIndex++) {
      const pot = availablePots[potIndex]
      const shuffledTeams = shuffleArray([...pot.teams])
      shuffledTeams.forEach((team) => {
        remainingTeams.push({ team: { ...team, potIndex }, potIndex }) // Store potIndex in team
      })
    }

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

  const scrollPot = (potIndex: number, direction: "left" | "right") => {
    const container = document.getElementById(`pot-${potIndex}`)
    if (container) {
      const scrollAmount = 200
      container.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      })
    }
  }

  const hasDrawn = groups.length > 0 && groups[0].teams.length > 0
  const isManualMode = drawMode === "manual"
  const isAutomaticMode = drawMode === "automatic"
  const isInstantMode = drawMode === "instant"
  const shouldShowGroups = hasDrawn || (isManualMode && groups.length > 0)
  const hasRemainingTeams = availablePots.some((pot) => pot.teams.length > 0)

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground py-4 md:py-6 mb-4 md:mb-6 shadow-sm">
        <div className="container mx-auto px-3 md:px-4 max-w-7xl">
          <div className="flex items-center justify-center gap-2 md:gap-3">
            <Trophy className="w-8 h-8 md:w-10 md:h-10 flex-shrink-0" />
            <div className="text-center">
              <h1 className="text-xl md:text-3xl lg:text-4xl font-bold leading-tight">Copa do Mundo FIFA 2026</h1>
              <p className="text-sm md:text-lg opacity-90">Simulador de Sorteio</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-3 md:px-4 pb-6 md:pb-8 max-w-7xl">
        {!drawMode && (
          <div className="flex gap-2 md:gap-3 overflow-x-auto pb-2 mb-4 md:mb-6 snap-x snap-mandatory">
            <Button onClick={() => startDraw("automatic")} size="lg" className="gap-2 flex-shrink-0 snap-center">
              <Shuffle className="w-4 h-4 md:w-5 md:h-5" />
              <span className="text-sm md:text-base">Automático</span>
            </Button>
            <Button
              onClick={() => startDraw("instant")}
              variant="secondary"
              size="lg"
              className="gap-2 flex-shrink-0 snap-center"
            >
              <Zap className="w-4 h-4 md:w-5 md:h-5" />
              <span className="text-sm md:text-base">Instantâneo</span>
            </Button>
            <Button
              onClick={() => startDraw("manual")}
              variant="outline"
              size="lg"
              className="gap-2 flex-shrink-0 snap-center"
            >
              <Hand className="w-4 h-4 md:w-5 md:h-5" />
              <span className="text-sm md:text-base">Manual</span>
            </Button>
          </div>
        )}

        {drawMode && (
          <div className="flex gap-2 md:gap-3 overflow-x-auto pb-2 mb-4 md:mb-6 snap-x snap-mandatory">
            <div className="px-3 py-2 bg-primary text-primary-foreground rounded-lg font-semibold text-xs md:text-sm flex-shrink-0 snap-center flex items-center">
              {isManualMode ? "Modo Manual" : isInstantMode ? "Modo Instantâneo" : "Modo Automático"}
            </div>
            {isManualMode && hasRemainingTeams && (
              <Button
                onClick={completeDrawAutomatically}
                variant="secondary"
                size="lg"
                className="gap-2 flex-shrink-0 snap-center"
              >
                <Zap className="w-4 h-4 md:w-5 md:h-5" />
                <span className="text-sm md:text-base">Completar</span>
              </Button>
            )}
            <Button
              onClick={resetDraw}
              variant="outline"
              size="lg"
              className="gap-2 bg-transparent flex-shrink-0 snap-center"
            >
              <RotateCcw className="w-4 h-4 md:w-5 md:h-5" />
              <span className="text-sm md:text-base">Reiniciar</span>
            </Button>
          </div>
        )}

        {currentDrawingTeam && (
          <Card className="p-4 md:p-6 mb-4 md:mb-6 bg-primary text-primary-foreground animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-center gap-3">
              <span className="text-3xl md:text-4xl">{currentDrawingTeam.flag}</span>
              <div className="text-left">
                <p className="text-xs font-medium opacity-90">Sorteando</p>
                <h2 className="text-lg md:text-2xl font-bold leading-tight">{currentDrawingTeam.name}</h2>
              </div>
            </div>
          </Card>
        )}

        {isManualMode && availablePots.length > 0 && (
          <Card className="p-3 md:p-4 mb-4 md:mb-6 bg-accent/10 border-accent">
            <p className="text-sm md:text-base font-semibold mb-1">
              {selectedTeam
                ? movingFromGroup !== null
                  ? `${selectedTeam.team.flag} ${selectedTeam.team.name} - Mover para outro grupo`
                  : `${selectedTeam.team.flag} ${selectedTeam.team.name} - Selecione um grupo`
                : `Selecione uma seleção`}
            </p>
            <p className="text-xs text-muted-foreground">
              {movingFromGroup !== null
                ? "Clique em um grupo para mover ou clique no grupo atual para cancelar"
                : "México no Grupo A • Mesmo pote separado • Mesma confederação separada (UEFA: máx 2/grupo em 4 grupos)"}
            </p>
          </Card>
        )}

        {!isAutomaticMode &&
          !isInstantMode &&
          availablePots.length > 0 &&
          availablePots.some((pot) => pot.teams.length > 0) && (
            <div className={`space-y-4 transition-all duration-500 ${selectedTeam ? "mb-4" : "mb-6 md:mb-8"}`}>
              <h2 className="text-lg md:text-xl font-bold">Potes do Torneio</h2>
              {availablePots.map((pot, potIndex) => {
                const shouldHidePot = selectedTeam && selectedTeam.potIndex !== potIndex

                return (
                  <Card
                    key={potIndex}
                    className={`p-3 md:p-4 transition-all duration-500 ${
                      isManualMode && pot.teams.length > 0
                        ? "ring-2 ring-primary shadow-lg"
                        : pot.teams.length === 0
                          ? "opacity-50"
                          : ""
                    } ${shouldHidePot ? "opacity-0 h-0 overflow-hidden p-0 mb-0" : "opacity-100"}`}
                  >
                    {!shouldHidePot && (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm md:text-base font-bold text-primary">{pot.name}</h3>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => scrollPot(potIndex, "left")}
                              className="h-7 w-7 p-0"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => scrollPot(potIndex, "right")}
                              className="h-7 w-7 p-0"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <div
                          id={`pot-${potIndex}`}
                          className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide"
                          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                        >
                          {pot.teams.map((team, teamIndex) => (
                            <button
                              key={teamIndex}
                              onClick={() => isManualMode && handleTeamSelect(team, potIndex)}
                              disabled={!isManualMode || pot.teams.length === 0}
                              className={`flex-shrink-0 w-24 md:w-28 snap-center transition-all ${
                                isManualMode && pot.teams.length > 0
                                  ? "hover:scale-105 cursor-pointer active:scale-95"
                                  : "cursor-not-allowed"
                              } ${selectedTeam?.team.code === team.code ? "scale-105" : ""}`}
                            >
                              <Card
                                className={`p-2 h-full ${
                                  selectedTeam?.team.code === team.code
                                    ? "ring-2 ring-primary bg-accent shadow-lg"
                                    : "bg-card hover:bg-accent/50"
                                }`}
                              >
                                <div className="flex flex-col items-center gap-1.5 text-center">
                                  <span className="text-2xl md:text-3xl">{team.flag}</span>
                                  <p className="font-semibold text-xs leading-tight line-clamp-2">{team.name}</p>
                                  <p className="text-[10px] text-muted-foreground">{team.confederation}</p>
                                </div>
                              </Card>
                            </button>
                          ))}
                          {pot.teams.length === 0 && (
                            <div className="w-full text-center py-4 text-muted-foreground text-xs">Todas sorteadas</div>
                          )}
                        </div>
                      </>
                    )}
                  </Card>
                )
              })}
            </div>
          )}

        {shouldShowGroups && (
          <div>
            <h2 className="text-lg md:text-xl font-bold mb-3 md:mb-4">
              {isManualMode ? "Sorteio em Andamento" : "Resultado do Sorteio"}
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-3 snap-x snap-mandatory md:grid md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6">
              {groups.map((group, groupIndex) => {
                const canPlace =
                  selectedTeam &&
                  canPlaceTeamInGroup(selectedTeam.team, groupIndex, selectedTeam.potIndex, groups, movingFromGroup)

                return (
                  <Card
                    key={groupIndex}
                    onClick={() => isManualMode && selectedTeam && handleGroupSelect(groupIndex)}
                    className={`p-2 flex-shrink-0 w-32 md:w-auto snap-center animate-in fade-in slide-in-from-bottom-4 duration-500 transition-all ${
                      isManualMode && selectedTeam
                        ? canPlace
                          ? "cursor-pointer hover:ring-2 hover:ring-primary hover:shadow-lg active:scale-95"
                          : "opacity-50 cursor-not-allowed"
                        : ""
                    } ${movingFromGroup === groupIndex ? "ring-2 ring-amber-500" : ""}`}
                    style={{ animationDelay: `${groupIndex * 50}ms` }}
                  >
                    <div className="text-center mb-1.5">
                      <div className="inline-flex items-center justify-center w-6 h-6 md:w-7 md:h-7 rounded-full bg-primary text-primary-foreground font-bold text-xs md:text-sm mb-0.5">
                        {group.name}
                      </div>
                      <h3 className="text-[10px] md:text-xs font-bold">Grupo {group.name}</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {group.teams.map((team, teamIndex) => (
                        <div
                          key={teamIndex}
                          onClick={(e) => {
                            if (isManualMode) {
                              handlePlacedTeamClick(team, groupIndex, e)
                            }
                          }}
                          className={`flex flex-col items-center gap-0.5 p-1 rounded-md bg-card border border-border transition-all ${
                            isManualMode
                              ? "cursor-pointer hover:bg-accent hover:ring-1 hover:ring-primary active:scale-95"
                              : "hover:bg-accent/50"
                          } ${selectedTeam?.team.code === team.code && movingFromGroup === groupIndex ? "ring-1 ring-primary bg-accent" : ""}`}
                        >
                          <span className="text-sm md:text-base flex-shrink-0">{team.flag}</span>
                          <p className="font-semibold text-[8px] md:text-[9px] text-center leading-tight line-clamp-1">
                            {team.name}
                          </p>
                          <p className="text-[7px] md:text-[8px] text-muted-foreground">{team.confederation}</p>
                        </div>
                      ))}
                      {group.teams.length === 0 && !isManualMode && (
                        <div className="col-span-2 text-center py-2 md:py-3 text-muted-foreground text-[9px]">
                          Aguardando...
                        </div>
                      )}
                      {isManualMode &&
                        Array.from({ length: 4 - group.teams.length }).map((_, i) => (
                          <div
                            key={`empty-${i}`}
                            className="p-1 rounded-md border border-dashed border-muted-foreground/20 text-center text-muted-foreground text-[8px] flex items-center justify-center min-h-[3rem]"
                          >
                            Vaga
                          </div>
                        ))}
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-6 md:mt-8 text-center text-xs text-muted-foreground space-y-1">
          <p>48 seleções • 12 grupos • 4 seleções por grupo</p>
          <p>
            Edite <code className="px-1.5 py-0.5 bg-muted rounded text-xs">data/teams.json</code> para personalizar
          </p>
        </div>
      </div>
    </div>
  )
}
